import { create } from 'zustand';
import { storeGet, storeSet, bridge } from '../lib/ipc';
import { useContentStore } from './contentStore';
import { XtreamClient } from '../lib/xtream';
import { M3uClient, BaseClient } from '../lib/m3u';
import { fetchPanelConfig, fetchRemotePlaylists, registerDevice, isBlockedStatus } from '../lib/panel';
import { configureTmdb, setTmdbEnabled } from '../lib/tmdb';
import { configureWeather } from '../lib/weather';
import { translate } from '../lib/i18n';
import type { Account, AppSettings, LoginResponse, PanelConfig, AppNotification } from '../types';
import { DEFAULT_SETTINGS } from '../types';

/** Ekran yönlendirme — basit yığın tabanlı router */
export type RouteName =
    | 'splash'
    | 'login'
    | 'accounts'
    | 'dashboard'
    | 'live'
    | 'movies'
    | 'series'
    | 'search'
    | 'settings'
    | 'profile';

export interface Route {
    name: RouteName;
    params?: Record<string, unknown>;
}

interface AppState {
    routes: Route[];
    accounts: Account[];
    activeAccount: Account | null;
    session: LoginResponse | null;
    client: BaseClient | null;
    settings: AppSettings;
    panelConfig: PanelConfig | null;
    initialized: boolean;
    syncOverlay: { show: boolean; message: string };
    /** Panelden gelen cihaz erişim durumu: 'active' | 'banned' | 'expired' | 'repair' */
    deviceStatus: string;
    deviceDaysLeft: number | null;

    // router
    push: (name: RouteName, params?: Record<string, unknown>) => void;
    replace: (name: RouteName, params?: Record<string, unknown>) => void;
    back: () => boolean;

    // yaşam döngüsü
    init: () => Promise<void>;
    /** Cihazı panele kaydeder + yasak/süre durumunu uygular (banlandıysa erişimi keser) */
    checkDeviceStatus: () => Promise<void>;
    syncRemoteAccounts: () => Promise<void>;
    saveAccounts: (accounts: Account[]) => Promise<void>;
    loginWithAccount: (account: Account) => Promise<{ ok: boolean; error?: string }>;
    logout: () => void;
    updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
    
    // global ui
    setSyncOverlay: (show: boolean, message?: string) => void;

    // notifications
    notifications: AppNotification[];
    fetchNotifications: () => Promise<void>;
    markNotificationsRead: () => void;
}

function resolveServerUrl(account: Account, panel: PanelConfig | null): string {
    const url = account.serverUrl?.trim() || (panel?.api_url as string) || 'http://osplayer.com.tr';
    return url.replace(/\/+$/, '');
}

/**
 * Panel playlist kaydını Xtream hesabına çevirir.
 * - type=xtream: username/password + url (sunucu tabanı) doğrudan gelir.
 * - type=m3u: panelde çoğu kayıt get.php?username=..&password=.. biçiminde
 *   Xtream M3U linkidir — kimlik bilgileri URL'den ayıklanıp Xtream hesabına çevrilir.
 * Çevrilemeyenler (gerçek .m3u dosyası, stalker) null döner ve atlanır.
 */
function remoteToAccount(r: import('../lib/panel').RemotePlaylist): Account | null {
    let username = r.username?.trim() || '';
    let password = r.password?.trim() || '';
    let serverUrl = (r.server_url || r.url || '').trim();

    if ((!username || !password) && r.url) {
        try {
            const u = new URL(r.url);
            const user = u.searchParams.get('username');
            const pass = u.searchParams.get('password');
            if (user && pass) {
                username = user;
                password = pass;
                serverUrl = u.origin;
            }
        } catch {
            /* geçersiz URL → atla */
        }
    }
    let isFreeM3u = false;
    if (!username || !password) {
        // M3U linki mi kontrol et (basitçe .m3u bitiyorsa ya da parametresizse ve geçerli URL ise M3U kabul et)
        if (serverUrl && (serverUrl.includes('.m3u') || r.type === 'm3u')) {
            isFreeM3u = true;
            username = 'M3U_FREE'; // dummy username
            password = '';
        } else {
            console.warn('[Sync] remoteToAccount: username/password bulunamadı, link atlandı →', JSON.stringify(r));
            return null;
        }
    }

    // serverUrl bir get.php linkiyse tabana indir (M3U linklerinde tam yol gerekir, dokunma)
    if (!isFreeM3u) {
        try {
            const u = new URL(serverUrl);
            if (u.pathname && u.pathname !== '/') serverUrl = u.origin;
        } catch {
            /* olduğu gibi bırak */
        }
    }

    return {
        accountName: r.account_name || r.name || username,
        username,
        password,
        serverUrl: serverUrl || undefined,
        isManual: false,
        isFreeM3u,
    };
}

/** Online hesap eşleştirme anahtarı (panel kayıtları için) */
function onlineKey(a: Account): string {
    return `${a.accountName ?? ''}|${a.username}|${a.serverUrl ?? ''}`;
}

/**
 * init() için Promise kilidi — React Strict Mode'da useEffect iki kez çalıştığında
 * ya da birden fazla bileşen aynı anda init() çağırdığında yalnızca TEK bir
 * başlatma zinciri çalışır; diğerleri aynı Promise'i bekler.
 */
let _initPromise: Promise<void> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
    routes: [{ name: 'splash' }],
    accounts: [],
    activeAccount: null,
    session: null,
    client: null,
    settings: DEFAULT_SETTINGS,
    panelConfig: null,
    initialized: false,
    syncOverlay: { show: false, message: 'Lütfen Bekleyin...' },
    deviceStatus: 'active',
    deviceDaysLeft: null,
    notifications: [],

    push: (name, params) => set((s) => ({ routes: [...s.routes, { name, params }] })),
    replace: (name, params) => set((s) => ({ routes: [...s.routes.slice(0, -1), { name, params }] })),
    back: () => {
        const { routes } = get();
        if (routes.length <= 1) return false;
        set({ routes: routes.slice(0, -1) });
        return true;
    },

    init: async () => {
        // Promise kilidi: birden fazla çağrı aynı Promise'i paylaşır
        if (_initPromise) return _initPromise;
        _initPromise = (async () => {
        const [accounts, settings] = await Promise.all([
            storeGet<Account[]>('accounts', []),
            storeGet<AppSettings>('settings', DEFAULT_SETTINGS),
        ]);
        const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
        set({ accounts, settings: mergedSettings, initialized: true });
        // TMDB kullanımı ayara göre aç/kapat (panel key'i sonra configureTmdb ile gelir)
        setTmdbEnabled(mergedSettings.useTmdb);
        // TMDB veri dili: kullanıcı seçimi (panel sadece API key sağlar)
        configureTmdb(undefined, mergedSettings.tmdbLanguage);

        // Cihaz kaydı + yasak/süre kontrolü (panelde key resetlendiyse de burada senkronlanır).
        // fetchPanelConfig'ten ÖNCE çalışır ki olası yeni key panel isteklerinde kullanılsın.
        await get().checkDeviceStatus();

        // Rate-limit önleme: istekler arasında 2sn bekleme (429 Too Many Requests)
        await new Promise<void>((r) => setTimeout(r, 2_000));

        // Panel config arka planda; başarısızlık uygulamayı engellemez
        try {
            const panel = await fetchPanelConfig();
            if (panel) {
                set({ panelConfig: panel });
                // Dil kullanıcı ayarından gelir; panelden yalnızca API key alınır
                configureTmdb(panel.tmdb_api_key);
                // WeatherAPI.com — panel'den gelen key önceliklidir,
                // yoksa kullanıcının manuel girdiği key kullanılır
                const manualKey = get().settings.weatherApiKey;
                configureWeather(panel.weather_api_key || manualKey);
            }
        } catch {
            /* panelsiz devam */
        }

        // Rate-limit önleme: panel config'ten sonra 2sn bekleme
        await new Promise<void>((r) => setTimeout(r, 2_000));

        // Online (panelden) hesapları senkronla
        await get().syncRemoteAccounts();
        await get().fetchNotifications();

        // Uygulama açıkken periyodik (10 dk): cihaz kaydı + yasak/süre durumu
        // 5 dk'dan 10 dk'ya çıkarıldı — sunucu rate-limit'ini önlemek için.
        setInterval(() => {
            get().checkDeviceStatus()
                .then(() => new Promise<void>((r) => setTimeout(r, 3_000)))
                .then(() => get().syncRemoteAccounts())
                .catch(() => { /* yoksay */ });
            get().fetchNotifications().catch(() => {});
        }, 10 * 60_000);
        })();
        return _initPromise;
    },

    checkDeviceStatus: async () => {
        const reg = await registerDevice();
        // Panele ulaşılamadıysa (status=null) mevcut duruma dokunma — ağ hatası yüzünden
        // çalışan cihazı yanlışlıkla yasaklama.
        if (reg.status === null) return;

        const blocked = isBlockedStatus(reg.status);
        const wasBlocked = isBlockedStatus(get().deviceStatus);

        if (blocked) {
            // Cihaz panelden yasaklandı / süresi doldu → erişimi ANINDA kes:
            // aktif yayını (mpv native) durdur, çalan tüm <video>'ları (html5) duraklat.
            try { bridge().mpv.stop(); } catch { /* yoksay */ }
            try {
                document.querySelectorAll('video').forEach((v) => {
                    try { v.pause(); } catch { /* yoksay */ }
                });
            } catch { /* yoksay */ }
            set({ deviceStatus: reg.status as string, deviceDaysLeft: reg.daysLeft });
        } else {
            // Erişim açık. Daha önce yasaklıyken panelden yasak kaldırıldıysa normale dön.
            set({ deviceStatus: 'active', deviceDaysLeft: reg.daysLeft });
            if (wasBlocked) {
                // Engelleme ekranı kalkar; kullanıcı hesap seçiminden devam eder.
                set({ routes: [{ name: get().activeAccount ? 'dashboard' : 'accounts' }] });
            }
        }
    },

    /**
     * Panelden cihaza tanımlı oynatma listelerini çekip yerel hesap listesiyle
     * birleştirir: yeni gelen eklenir, mevcut online hesap güncellenir, panelden
     * silinen online hesap yerelden de kaldırılır. Manuel hesaplara dokunulmaz.
     */
    syncRemoteAccounts: async () => {
        try {
            console.log('[Sync] syncRemoteAccounts başladı...');
            const remote = await fetchRemotePlaylists();
            if (remote === null) {
                console.warn('[Sync] fetchRemotePlaylists null döndü — yerel hesap listesine dokunulmuyor.');
                return;
            }

            console.log(`[Sync] Panel'den ${remote.length} kayıt geldi:`, remote);

            const remoteAccounts = remote
                .map(remoteToAccount)
                .filter((a): a is Account => a !== null);

            console.log(`[Sync] ${remoteAccounts.length} hesaba dönüştürüldü (${remote.length - remoteAccounts.length} atlandı).`);

            const remoteKeys = new Set(remoteAccounts.map(onlineKey));

            const current = [...get().accounts];
            let changed = false;

            for (const acc of remoteAccounts) {
                const idx = current.findIndex((a) => !a.isManual && onlineKey(a) === onlineKey(acc));
                if (idx >= 0) {
                    const merged = { ...current[idx], ...acc };
                    if (JSON.stringify(merged) !== JSON.stringify(current[idx])) {
                        current[idx] = merged;
                        changed = true;
                    }
                } else {
                    current.push(acc);
                    changed = true;
                }
            }

            // Panelden silinen online hesapları kaldır (manueller korunur)
            const cleaned = current.filter((a) => a.isManual || remoteKeys.has(onlineKey(a)));
            if (cleaned.length !== current.length) changed = true;

            if (changed) {
                console.log('[Sync] Hesap listesi güncellendi, kaydediliyor...');
                await get().saveAccounts(cleaned);
            } else {
                console.log('[Sync] Hesap listesinde değişiklik yok.');
            }
        } catch (e) {
            console.error('[Sync] syncRemoteAccounts HATA:', e);
        }
    },

    saveAccounts: async (accounts) => {
        set({ accounts });
        await storeSet('accounts', accounts);
    },

    loginWithAccount: async (account) => {
        const serverUrl = resolveServerUrl(account, get().panelConfig);
        let client: BaseClient;
        if (account.isFreeM3u) {
            client = new M3uClient(serverUrl);
        } else {
            client = new XtreamClient(serverUrl, account.username, account.password);
        }
        const res = await client.login();
        const lang = get().settings.language;
        if (!res || !res.user_info || Number(res.user_info.auth) !== 1) {
            const msg =
                res?.user_info?.message ||
                (res
                    ? translate(lang, 'Kullanıcı adı veya şifre hatalı')
                    : translate(lang, 'Sunucuya bağlanılamadı'));
            return { ok: false, error: msg };
        }
        if ((res.user_info.status ?? 'Active') !== 'Active') {
            return { ok: false, error: `${translate(lang, 'Hesap durumu')}: ${res.user_info.status}` };
        }
        const accounts = get().accounts.map((a) => ({
            ...a,
            isActive: a.username === account.username && a.serverUrl === account.serverUrl,
        }));
        // lg-webos saveAccount mantığı: hesap anahtarı değiştiyse eski hesabın tüm
        // içerik önbelleği silinir, yeni hesabın verileri API'den taze çekilir.
        const content = useContentStore.getState();
        const prevKey = content.accountKey();
        set({ activeAccount: { ...account, isActive: true }, session: res, client });
        if (content.accountKey() !== prevKey) {
            content.reset(); // eski hesabın kanal/film/dizi cache'i + kullanıcı verisi temizlenir
            await content.loadPersist(); // yeni hesabın kalıcı verileri (favori/pozisyon/gizli) yüklenir
        }
        await get().saveAccounts(accounts);
        await storeSet('lastAccount', { username: account.username, serverUrl: account.serverUrl ?? '' });
        return { ok: true };
    },

    logout: () => {
        // lg-webos clear-account mantığı: çıkışta içerik önbelleği de temizlenir
        useContentStore.getState().reset();
        set({ activeAccount: null, session: null, client: null, routes: [{ name: 'accounts' }] });
        void storeSet('lastAccount', null);
    },

    updateSettings: async (patch) => {
        const settings = { ...get().settings, ...patch };
        set({ settings });
        await storeSet('settings', settings);
        // weatherApiKey değişti && panel key yoksa manuel key'i uygula
        if ('weatherApiKey' in patch) {
            const panelKey = get().panelConfig?.weather_api_key;
            if (!panelKey) configureWeather(patch.weatherApiKey);
        }
        // TMDB kullanımı anahtarı değişti → modüle uygula
        if ('useTmdb' in patch) setTmdbEnabled(settings.useTmdb);
        // TMDB veri dili değişti → modüle uygula
        if ('tmdbLanguage' in patch) configureTmdb(undefined, settings.tmdbLanguage);
    },

    setSyncOverlay: (show, message = 'Güncelleniyor...') => {
        set({ syncOverlay: { show, message } });
    },

    fetchNotifications: async () => {
        try {
            const url = (get().panelConfig?.api_url ?? 'http://osplayer.com.tr') + '/api/device/announcements';
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) {
                const readSet = new Set(await storeGet<string[]>('readNotifications', []));
                const mapped: AppNotification[] = data.map((n: any) => {
                    const id = n.id || n.uuid || n.announcement_id || ((n.title || 'Duyuru') + '_' + (n.created_at || ''));
                    return {
                        id,
                        title: n.title || 'Duyuru',
                        msg: n.content || '',
                        date: n.created_at || '',
                        read: readSet.has(id),
                    };
                });
                set({ notifications: mapped });
            }
        } catch {
            // yoksay
        }
    },

    markNotificationsRead: async () => {
        const notifs = get().notifications;
        const readSet = new Set(await storeGet<string[]>('readNotifications', []));
        let changed = false;
        const updated = notifs.map((n) => {
            if (!n.read) {
                readSet.add(n.id);
                changed = true;
                return { ...n, read: true };
            }
            return n;
        });
        if (changed) {
            set({ notifications: updated });
            await storeSet('readNotifications', Array.from(readSet));
        }
    },
}));

/** Aktif route (en üst) */
export function useCurrentRoute(): Route {
    return useAppStore((s) => s.routes[s.routes.length - 1]);
}
