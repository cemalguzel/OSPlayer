import { bridge, httpJson, httpPostJson } from './ipc';
import type { PanelConfig } from '../types';

/**
 * OS Player panel API'si (osplayer.com.tr).
 * Birincil: api/device/settings (latest_apk / config buradan gelir)
 * Yedek   : api/app_config.php (eski sürümler)
 * Panel erişilemezse uygulama panelsiz (manuel hesapla) çalışmaya devam eder.
 */
import { PANEL_BASE } from '../../electron/ad-policy';
export { PANEL_BASE };

async function deviceHeaders(): Promise<Record<string, string>> {
    const d = await bridge().device.info();
    return {
        'x-device-mac': d.mac,
        'x-device-key': d.deviceKey,
        'x-device-id': d.deviceId,
        'X-Api-Token': 'osplayer_x8k2s9p4n7m1q3r6t0v5w'
    };
}

interface RegisterResponse {
    status?: string;
    new_device_key?: string | null;
    days_left?: number;
}

/** Cihaz kayıt/durum sonucu — panelden gelen erişim durumu. */
export interface DeviceStatusResult {
    /** 'active' | 'banned' | 'expired' | 'repair' | null (panele ulaşılamadı) */
    status: string | null;
    daysLeft: number | null;
}

/** Cihaz panelden yasaklandı/süresi doldu mu? */
export function isBlockedStatus(status: string | null | undefined): boolean {
    const s = (status ?? '').toLowerCase();
    return s === 'banned' || s === 'expired' || s === 'repair';
}

/**
 * Cihazı panele kaydeder ve erişim durumunu (active/banned/expired) döndürür.
 * Panelde key resetlendiyse yeni key burada senkronlanır.
 * Panele ulaşılamazsa status=null döner (erişim KAPATILMAZ — false-positive önlenir).
 */
export async function registerDevice(): Promise<DeviceStatusResult> {
    const headers = await deviceHeaders();
    const d = await bridge().device.info();
    const appVersion = await bridge().app.version();
    const deviceInfoJson = JSON.stringify({
        os: d.platform,
        osVersion: d.osVersion,
        model: d.model,
        appVersion
    });

    try {
        const res = await httpPostJson<RegisterResponse>(
            `${PANEL_BASE}/api/device/register`,
            {
                mac: d.mac,
                device_key: d.deviceKey,
                device_info: deviceInfoJson,
                app_version: appVersion,
                key_sync: 1 // panelde key değiştirildiyse sunucu yeni key'i döndürür
            },
            headers,
            12_000
        );
        if (!res) return { status: null, daysLeft: null };
        // Panelde cihaz key resetlendiyse yeni key'i sakla — sonraki tüm istekler
        // (playlist vs.) ve Profil/Hesap ekranları yeni key'i kullanır.
        const newKey = res.new_device_key;
        if (newKey && typeof newKey === 'string' && newKey.toUpperCase() !== d.deviceKey.toUpperCase()) {
            await bridge().store.set('device.key', newKey.toUpperCase());
            await bridge().store.set('device.keySynced', true);
        }
        return {
            status: typeof res.status === 'string' ? res.status.toLowerCase() : 'active',
            daysLeft: typeof res.days_left === 'number' ? res.days_left : null,
        };
    } catch (e) {
        console.error('Device registration failed:', e);
        return { status: null, daysLeft: null };
    }
}

export async function fetchPanelConfig(): Promise<PanelConfig | null> {
    // Not: cihaz kaydı (registerDevice) artık çağıran tarafından (appStore.checkDeviceStatus)
    // bu fonksiyondan ÖNCE yapılır — böylece olası yeni key burada kullanılır.
    const headers = await deviceHeaders();

    const primary = await httpJson<PanelConfig>(
        `${PANEL_BASE}/api/device/settings?platform=desktop`,
        headers,
        12_000
    );
    
    if (primary && typeof primary === 'object') {
        if (primary.device_key && typeof primary.device_key === 'string') {
            await bridge().store.set('device.key', primary.device_key.toUpperCase());
            await bridge().store.set('device.keySynced', true);
        }
        return primary;
    }
    
    return httpJson<PanelConfig>(`${PANEL_BASE}/api/app_config.php`, headers, 12_000);
}

export interface VersionInfo {
    version: string | null;
    update_url: string | null;
    platform: string;
    source?: string;
}

/**
 * Panelden belirli platform için en güncel sürüm bilgisini çeker.
 * Endpoint: GET /api/device/version?platform=windows
 * → { version, update_url, platform, source }
 */
export async function fetchLatestVersion(platform = 'windows'): Promise<VersionInfo | null> {
    return httpJson<VersionInfo>(
        `${PANEL_BASE}/api/device/version?platform=${encodeURIComponent(platform)}`,
        undefined,
        12_000,
    );
}

export interface RemotePlaylist {
    name?: string;
    account_name?: string;
    type?: string; // 'xtream' | 'm3u' | 'stalker'
    username?: string;
    password?: string;
    server_url?: string;
    url?: string;
}

/**
 * Panelden cihaza tanımlı (online) hesap/playlist listesi.
 * null = istek başarısız (ağ/yetki) — boş liste ([]) ile karıştırma:
 * null'da yerel online hesaplara dokunulmaz, []'de panelden silinmiş demektir.
 */
export async function fetchRemotePlaylists(): Promise<RemotePlaylist[] | null> {
    const headers = await deviceHeaders();
    const res = await httpJson<unknown>(`${PANEL_BASE}/api/playlist`, headers, 12_000);

    console.log('[Panel] fetchRemotePlaylists ham yanıt:', JSON.stringify(res)?.slice(0, 500));

    if (res === null || res === undefined) {
        console.warn('[Panel] fetchRemotePlaylists: API yanıt vermedi veya null döndü.');
        return null;
    }

    // Doğrudan dizi döndü
    if (Array.isArray(res)) return res as RemotePlaylist[];

    // Sarmalı yanıt: { data: [...] } | { playlists: [...] } | { items: [...] } | { list: [...] }
    if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        for (const key of ['data', 'playlists', 'items', 'list', 'results', 'accounts']) {
            if (Array.isArray(obj[key])) {
                console.log(`[Panel] fetchRemotePlaylists: Sarmalı yanıt tespit edildi → key="${key}", eleman sayısı=${(obj[key] as unknown[]).length}`);
                return obj[key] as RemotePlaylist[];
            }
        }
        console.warn('[Panel] fetchRemotePlaylists: Yanıt obje ama bilinen bir array alanı bulunamadı:', Object.keys(obj));
    }

    return null;
}
