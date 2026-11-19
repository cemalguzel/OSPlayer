import { app, BrowserWindow, ipcMain, shell, protocol, net, screen } from 'electron';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * Pencere mimarisi (Standalone MPV penceresi):
 *  - mainWindow   : React arayüzü — transparent (disableHardwareAcceleration zorunlu)
 *  - MPV          : kendi penceresi, mainWindow'un arkasında konumlandırılır
 *  - overlayWindow: şeffaf pencere, MPV'nin üstünde; info bar burada çizilir
 *
 * Neden transparent:
 *  VodPlayer/LiveTv MPV modunda bg-transparent render eder.
 *  mainWindow transparent olunca bu alan gerçekten şeffaf → arkasındaki
 *  MPV penceresi görünür. disableHardwareAcceleration olmadan siyah çıkar.
 */

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            bypassCSP: true,
            stream: true,
        },
    },
]);
import { MpvManager, MpvEvent } from './mpv';
import { MpvNative } from './mpv-native';
import { AppDatabase } from './db';
import { getDeviceInfo } from './device';
import { installAdvertising } from './advertising';

// Donanım hızlandırma KAPALI olmalı: gömülü MPV penceresi (native WS_CHILD ya da
// arkadaki standalone pencere) ancak böyle görünür. Açıkken Chromium tüm pencereyi
// bir DirectComposition yüzeyiyle sunar ve native video penceresini ÖRTER → ses gelir
// ama görüntü beyaz/siyah kalır. whenReady'den ÖNCE çağrılmalı.
app.disableHardwareAcceleration();
// X11 çocuk penceresi Wayland oturumlarında XWayland üzerinden çalışır.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
function platformRect(window: BrowserWindow, rect: Electron.Rectangle): Electron.Rectangle {
    return process.platform === 'win32' ? screen.dipToScreenRect(window, rect) : rect;
}

// IPTV portlarını serbest bırak
app.commandLine.appendSwitch('explicitly-allowed-ports',
    '1,7,9,11,13,15,17,19,20,21,22,23,25,37,42,43,53,69,77,79,87,95,101,102,103,104,' +
    '109,110,111,113,115,117,119,123,135,137,139,143,161,179,389,427,465,512,513,514,' +
    '515,526,530,531,532,540,548,556,563,587,601,636,993,995,1719,1720,1723,2049,3659,' +
    '4045,5060,5061,6000,6566,6665,6666,6667,6668,6669,6697,10080');

// Android'deki "OS Player 1.0.46 (Android 11; AFTKR )" biçiminin masaüstü karşılığı.
// Windows'ta: "OS Player <sürüm> (Windows 11)" — sürüm package.json'dan, OS adı os.release() ile.
function buildUserAgent(): string {
    const os = require('os') as typeof import('os');
    let osLabel = 'Windows';
    try {
        if (process.platform === 'win32') {
            // os.release() → "10.0.22000+" Windows 11, daha düşük build Windows 10.
            const rel = os.release();                       // örn. "10.0.22631"
            const build = parseInt(rel.split('.')[2] ?? '0', 10);
            osLabel = build >= 22000 ? 'Windows 11' : 'Windows 10';
        } else if (process.platform === 'darwin') {
            osLabel = `macOS ${os.release()}`;
        } else if (process.platform === 'linux') {
            osLabel = 'Linux';
        }
    } catch { /* algılama başarısızsa varsayılan "Windows" kalır */ }
    return `OS Player ${app.getVersion()} (${osLabel})`;
}

const APP_USER_AGENT = buildUserAgent();

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let mpv: MpvManager | null = null;
let store: AppDatabase;

// Video bölgesi: mainWindow içerik alanına göre CSS piksel (DIP) cinsinden
let videoRect: { x: number; y: number; width: number; height: number } | null = null;
let videoVisible = false;
let useNativeAddon = false; // libmpv-2.dll kullanılıyor mu?

// Dev sunucusu (vite) YALNIZCA run_dev.ps1 VITE_PORT'u ayarladığında kullanılır.
// `npm start` (build && electron .) paketlenmemiş çalışsa bile derlenmiş dist/'i
// app:// üzerinden yükler — aksi halde çalışmayan localhost:5173'e bağlanmaya
// çalışıp ERR_CONNECTION_REFUSED alır ve ekran beyaz kalır.
const useDevServer = !app.isPackaged && !!process.env.VITE_PORT;

function loadInto(win: BrowserWindow, hash: string) {
    if (useDevServer) {
        const port = process.env.VITE_PORT ?? '5173';
        void win.loadURL(`http://localhost:${port}/#${hash}`);
    } else {
        void win.loadURL(`app://./index.html#${hash}`);
    }
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        autoHideMenuBar: true,
        show: false,
        icon: path.join(__dirname, '..', 'favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
            webSecurity: false,
        },
    });
    loadInto(mainWindow, '/');
    installAdvertising(mainWindow, path.join(__dirname, 'preload.js'), loadInto, () => getDeviceInfo(store), APP_USER_AGENT);

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        try { mpv?.quit(); } catch { /* yoksay */ }
        overlayWindow?.destroy();
        overlayWindow = null;
    });

    const sync = () => syncVideoBounds();
    mainWindow.on('move', sync);
    mainWindow.on('resize', sync);
    mainWindow.on('maximize', sync);
    mainWindow.on('unmaximize', sync);
    mainWindow.on('enter-full-screen', sync);
    mainWindow.on('leave-full-screen', sync);
    mainWindow.on('minimize', () => {
        overlayWindow?.hide();
    });
    mainWindow.on('restore', () => {
        if (videoVisible) {
            syncVideoBounds();
            overlayWindow?.showInactive();
        }
    });
    mainWindow.on('focus', () => {
        if (videoVisible) {
            syncVideoBounds();
            // Odağa dönünce overlay'i geri göster (ana pencerenin sahipli penceresi)
            if (overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.showInactive();
                overlayWindow.moveTop();
            }
        }
    });
    // Başka uygulamaya geçilince overlay (info bar/menü) diğer uygulamaların
    // üstünde yüzmesin — ana pencere odağı kaybedince gizle.
    mainWindow.on('blur', () => {
        overlayWindow?.hide();
    });
}

function ensureOverlayWindow() {
    if (!mainWindow) return;
    if (!overlayWindow || overlayWindow.isDestroyed()) {
        overlayWindow = new BrowserWindow({
            // parent: mainWindow → overlay artık ana pencerenin "sahipli" (owned)
            // penceresi. Böylece: ana pencerenin üstünde kalır (info bar video
            // üstünde tek bütün gibi), ana pencereyle birlikte gizlenir/öne gelir,
            // BAŞKA uygulamaların üstünde yüzmez. Video alanına syncVideoBounds ile
            // birebir hizalanır.
            parent: mainWindow,
            frame: false,
            show: false,
            transparent: true,
            backgroundColor: '#00000000',
            focusable: false,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            hasShadow: false,
            roundedCorners: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        overlayWindow.setMenu(null);
        loadInto(overlayWindow, '/overlay');
        // alwaysOnTop KULLANMA: sahipli (owned) pencere zaten ana pencerenin
        // üstünde durur ve onunla birlikte arkaya geçer. alwaysOnTop ise (her
        // seviyede) diğer uygulamaların da üstüne çıkarıyordu — şikâyetin kökü.
    }
}

let lastBoundsStr = '';

function syncVideoBounds() {
    if (!mainWindow || !videoRect) return;
    const content = mainWindow.getContentBounds();

    const dipBounds = {
        x: Math.round(content.x + videoRect.x),
        y: Math.round(content.y + videoRect.y),
        width:  Math.max(1, Math.round(videoRect.width)),
        height: Math.max(1, Math.round(videoRect.height)),
    };

    // Mutlak fiziksel piksel (masaüstü) — standalone mpv.exe penceresi için
    const physBounds = platformRect(mainWindow, dipBounds);

    // Native addon WS_CHILD penceresi kullanır: koordinatlar PARENT CLIENT
    // alanına göredir (0,0 = içerik sol-üst), masaüstü değil. İçeriğin fiziksel
    // kökenini çıkararak istemci-göreli fiziksel px'e çevir (DPI-doğru).
    const targetBounds = useNativeAddon
        ? (() => {
            const originPhys = platformRect(mainWindow, {
                x: content.x, y: content.y, width: 0, height: 0,
            });
            return {
                x: physBounds.x - originPhys.x,
                y: physBounds.y - originPhys.y,
                width: physBounds.width,
                height: physBounds.height,
            };
        })()
        : physBounds;

    if (process.platform === 'linux' && useNativeAddon) {
        const scale = screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor;
        targetBounds.x=Math.round(targetBounds.x*scale); targetBounds.y=Math.round(targetBounds.y*scale);
        targetBounds.width=Math.round(targetBounds.width*scale); targetBounds.height=Math.round(targetBounds.height*scale);
    }
    const boundsStr = `${targetBounds.x},${targetBounds.y},${targetBounds.width},${targetBounds.height}`;
    if (lastBoundsStr !== boundsStr) {
        lastBoundsStr = boundsStr;
        mpv?.setWindowBounds(targetBounds).catch(() => undefined);
    }

    // overlayWindow: sadece aktif video varsa göster
    if (overlayWindow && !overlayWindow.isDestroyed() && videoVisible) {
        overlayWindow.setBounds(dipBounds);
        overlayWindow.moveTop();
        if (!overlayWindow.isVisible()) overlayWindow.showInactive();
    }
}

async function ensureMpv(): Promise<void> {
    ensureOverlayWindow();
    if (mpv?.isRunning) return;

    if (!mainWindow || mainWindow.isDestroyed()) return;

    const onEvent = (ev: MpvEvent) => {
        mainWindow?.webContents.send('mpv:event', ev);
        overlayWindow?.webContents.send('mpv:event', ev);
    };

    // HWND hesapla — 64-bit Windows'ta handle 8 bayttır; 32-bit okumak
    // pointer'ı kırpar ve CreateWindowExA'ya geçersiz parent vererek çökmeye
    // yol açabilir. Tampon 8 bayt ise tam 64-bit oku.
    const hwndBuf = mainWindow!.getNativeWindowHandle();
    const le = require('os').endianness() === 'LE';
    const wid = hwndBuf.length >= 8
        ? Number(le ? hwndBuf.readBigUInt64LE(0) : hwndBuf.readBigUInt64BE(0))
        : (le ? hwndBuf.readUInt32LE(0) : hwndBuf.readUInt32BE(0));

    // Masaüstü (mutlak fiziksel) bounds — mpv.exe fallback için
    const screenBounds = videoRect
        ? (() => {
            const content = mainWindow!.getContentBounds();
            const dip = {
                x: Math.round(content.x + videoRect!.x),
                y: Math.round(content.y + videoRect!.y),
                width: Math.max(1, Math.round(videoRect!.width)),
                height: Math.max(1, Math.round(videoRect!.height)),
            };
            return platformRect(mainWindow!, dip);
        })()
        : { x: -9999, y: -9999, width: 1280, height: 720 };

    // İstemci-göreli (parent client) fiziksel bounds — native WS_CHILD penceresi için
    const childBounds = videoRect
        ? (() => {
            const content = mainWindow!.getContentBounds();
            const originPhys = platformRect(mainWindow!, {
                x: content.x, y: content.y, width: 0, height: 0,
            });
            return {
                x: screenBounds.x - originPhys.x,
                y: screenBounds.y - originPhys.y,
                width: screenBounds.width,
                height: screenBounds.height,
            };
        })()
        : { x: 0, y: 0, width: 1280, height: 720 };

    if (process.platform === 'linux') {
        const scale=screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor;
        childBounds.x=Math.round(childBounds.x*scale); childBounds.y=Math.round(childBounds.y*scale);
        childBounds.width=Math.round(childBounds.width*scale); childBounds.height=Math.round(childBounds.height*scale);
    }
    // ── Önce Native Addon (libmpv-2.dll) dene ───────────────────────────
    try {
        const native = new MpvNative(onEvent, APP_USER_AGENT);
        await native.start({ ...childBounds, wid });
        mpv = native as unknown as MpvManager;
        useNativeAddon = true;
        console.log('[MPV] libmpv-2.dll native addon ile başlatıldı.');
    } catch (nativeErr) {
        if (process.platform !== 'win32') throw nativeErr;
        console.warn('[MPV] Native addon başarısız, mpv.exe fallback:', nativeErr);
        useNativeAddon = false;
        // ── Fallback: mpv.exe + IPC ──────────────────────────────────────
        mpv = new MpvManager(onEvent, APP_USER_AGENT);
        await mpv.start({ ...screenBounds, wid });
        console.log('[MPV] mpv.exe fallback ile başlatıldı.');
    }

    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.moveTop();
    }
}

function registerIpc() {
    console.log('[DEBUG] registerIpc cagrildi.');
    // IPC loglaması varsayılan KAPALI; ayrıca yüksek-frekanslı kanallar (video
    // konum takibi + overlay senk.) hiçbir zaman loglanmaz — yoksa MPV modunda
    // konsolu doldururlar. Hata ayıklamak için OSPLAYER_DEBUG=1 ile aç.
    const NOISY = new Set(['player:set-bounds', 'overlay:update', 'overlay:command', 'player:poke']);
    const debugIpc = process.env.OSPLAYER_DEBUG === '1';
    const logIpc = (name: string, args: any[]) => {
        if (!debugIpc || NOISY.has(name)) return;
        console.log(`[IPC RECEIVE] ${name}`, args.length ? args : '');
    };

    // ── HTTP proxy (CORS/mixed-content bypass) ──────────────────────────
    ipcMain.handle('http:request', async (_e, req: any) => {
        logIpc('http:request', [req?.url]);
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), req.timeoutMs ?? 20_000);
        try {
            const res = await fetch(req.url, {
                method: req.method ?? 'GET',
                headers: { 'User-Agent': APP_USER_AGENT, ...(req.headers ?? {}) },
                body: req.body,
                signal: controller.signal,
                redirect: 'follow',
            });
            const text = await res.text();
            let body: unknown = text;
            if ((req.responseType ?? 'json') === 'json') {
                try { body = JSON.parse(text); } catch { body = null; }
            }
            return { ok: res.ok, status: res.status, body, text: (req.responseType ?? 'json') === 'json' ? undefined : text };
        } catch (e) {
            return { ok: false, status: 0, body: null, error: String(e) };
        } finally {
            clearTimeout(t);
        }
    });

    // ── Veritabanı (SQLite) ────────────────────────────
    ipcMain.handle('store:get', (_e, key: string) => { logIpc('store:get', [key]); return store.get(key); });
    ipcMain.handle('store:set', (_e, key: string, value: unknown) => { logIpc('store:set', [key]); return store.set(key, value); });
    ipcMain.handle('store:delete', (_e, key: string) => { logIpc('store:delete', [key]); return store.delete(key); });

    ipcMain.handle('db:getFavorites', (_e, accountKey: string) => { logIpc('db:getFavorites', [accountKey]); return store.getFavorites(accountKey); });
    ipcMain.handle('db:isFavorite', (_e, accountKey: string, streamId: string, streamType: string) => { logIpc('db:isFavorite', [accountKey, streamId]); return store.isFavorite(accountKey, streamId, streamType); });
    ipcMain.handle('db:addFavorite', (_e, accountKey: string, streamId: string, streamType: string) => { logIpc('db:addFavorite', [accountKey, streamId]); return store.addFavorite(accountKey, streamId, streamType); });
    ipcMain.handle('db:removeFavorite', (_e, accountKey: string, streamId: string, streamType: string) => { logIpc('db:removeFavorite', [accountKey, streamId]); return store.removeFavorite(accountKey, streamId, streamType); });
    ipcMain.handle('db:getWatchPosition', (_e, accountKey: string, streamId: string) => { logIpc('db:getWatchPosition', [accountKey, streamId]); return store.getWatchPosition(accountKey, streamId); });
    ipcMain.handle('db:setWatchPosition', (_e, accountKey: string, streamId: string, pos: number, dur: number) => { logIpc('db:setWatchPosition', [accountKey, streamId, pos, dur]); return store.setWatchPosition(accountKey, streamId, pos, dur); });
    ipcMain.handle('db:getHiddenChannels', (_e, accountKey: string) => { logIpc('db:getHiddenChannels', [accountKey]); return store.getHiddenChannels(accountKey); });
    ipcMain.handle('db:addHiddenChannel', (_e, accountKey: string, streamId: string) => { logIpc('db:addHiddenChannel', [accountKey, streamId]); return store.addHiddenChannel(accountKey, streamId); });
    ipcMain.handle('db:removeHiddenChannel', (_e, accountKey: string, streamId: string) => { logIpc('db:removeHiddenChannel', [accountKey, streamId]); return store.removeHiddenChannel(accountKey, streamId); });

    // ── Cihaz / Uygulama ────────────────────────────────────────────────
    ipcMain.handle('device:info', () => { logIpc('device:info', []); return getDeviceInfo(store); });
    ipcMain.handle('app:version', () => { logIpc('app:version', []); return app.getVersion(); });
    ipcMain.handle('app:quit', (event) => { if (!mainWindow || event.sender !== mainWindow.webContents) return; logIpc('app:quit', []); return app.quit(); });

    ipcMain.on('player:poke', () => { logIpc('player:poke', []); mainWindow?.webContents.send('player:poke'); });
    ipcMain.on('player:exit-fullscreen', () => { logIpc('player:exit-fullscreen', []); mainWindow?.webContents.send('player:exit-fullscreen'); });

    ipcMain.handle('app:toggle-fullscreen', () => {
        logIpc('app:toggle-fullscreen', []);
        if (!mainWindow) return false;
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
        return mainWindow.isFullScreen();
    });
    ipcMain.handle('app:open-external', (_e, url: string) => { logIpc('app:open-external', [url]); return shell.openExternal(url); });
    // Not: Yeni sürüm indirme, Windows kısıtlamaları nedeniyle uygulama içinde
    // yapılmıyor; renderer doğrudan `app:open-external` ile update_url'i varsayılan
    // tarayıcıda açar ve indirme işletim sisteminin varsayılan mekanizmasıyla yürür.
    ipcMain.handle('app:clear-cache', async () => {
        logIpc('app:clear-cache', []);
        await mainWindow?.webContents.session.clearCache();
        await mainWindow?.webContents.session.clearStorageData({ storages: ['cachestorage'] });
        return true;
    });
    ipcMain.handle('app:zoom', (_e, factor: number) => {
        logIpc('app:zoom', [factor]);
        const f = Math.min(2, Math.max(0.5, factor));
        mainWindow?.webContents.setZoomFactor(f);
        return f;
    });

    // ── Oynatıcı penceresi ───────────────────────────────────────────────
    ipcMain.handle('player:set-bounds', (_e, rect: any) => {
        logIpc('player:set-bounds', [rect]);
        const zf = mainWindow?.webContents.getZoomFactor() ?? 1;
        videoRect = {
            x: rect.x * zf,
            y: rect.y * zf,
            width: rect.width * zf,
            height: rect.height * zf,
        };
        syncVideoBounds();
    });
    ipcMain.handle('player:show', async () => {
        logIpc('player:show', []);
        await ensureMpv();
        videoVisible = true;
        syncVideoBounds();
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.showInactive();
            overlayWindow.moveTop();
        }
        mainWindow?.focus();
    });
    ipcMain.handle('player:hide', async () => {
        logIpc('player:hide', []);
        videoVisible = false;
        // Önce akışı ANINDA boşalt (stop = dosyayı/akışı kaldır) ki ağ bağlantısı
        // arka planda asılı kalmasın; sonra tam teardown (quit). Eskiden yalnızca
        // quit çağrılıyordu ve quit, bağlantıyı kapatmadan önce ~300ms terminate
        // bekliyordu → canlı/film çıkışında bağlantı hemen kesilmiyordu.
        try { await mpv?.stop(); } catch { /* yoksay */ }
        mpv?.quit();
        mpv = null;
        overlayWindow?.hide();
        lastBoundsStr = '';
    });

    // ── MPV kontrol ─────────────────────────────────────────────────────
    ipcMain.handle('mpv:load', async (_e, url: string) => {
        logIpc('mpv:load', [url]);
        await ensureMpv();
        await mpv!.load(url);
    });
    ipcMain.handle('mpv:command', async (_e, cmd: unknown[]) => {
        if (!Array.isArray(cmd)) throw new Error('Geçersiz oynatıcı komutu');
        if (cmd[0] === 'set_property' && cmd[1] === 'volume') {
            if (typeof cmd[2] !== 'number' || !Number.isFinite(cmd[2])) throw new Error('Geçersiz ses seviyesi');
            cmd = ['set_property', 'volume', Math.max(0, Math.min(100, cmd[2]))];
        }
        logIpc('mpv:command', [cmd]);
        if (!mpv?.isRunning) return null;
        return mpv.command(cmd).catch(() => null);
    });
    ipcMain.handle('mpv:stop', async () => { logIpc('mpv:stop', []); return mpv?.stop(); });

    // Overlay penceresindeki kontrol/menü tıklamaları → mainWindow'daki oynatıcıya
    ipcMain.on('overlay:command', (_e, payload: any) => {
        logIpc('overlay:command', [payload]);
        mainWindow?.webContents.send('overlay:command', payload);
    });

    // ── Overlay durumu ───────────────────────────────
    ipcMain.on('overlay:update', (_e, state: any) => {
        logIpc('overlay:update', [state]);
        overlayWindow?.webContents.send('overlay:state', state);
        if (overlayWindow && state && typeof state === 'object') {
            if (state.visible && (state.showInfoBar || state.menu)) {
                overlayWindow.setIgnoreMouseEvents(false);
            } else {
                overlayWindow.setIgnoreMouseEvents(true, { forward: true });
            }
        }
    });
}

app.whenReady().then(() => {
    console.log('[DEBUG] app.whenReady() tetiklendi.');
    protocol.handle('app', (req) => {
        const url = new URL(req.url);
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/' || pathname === '') pathname = '/index.html';
        const filepath = path.join(__dirname, '..', 'dist', pathname);
        return net.fetch(pathToFileURL(filepath).toString());
    });

    console.log('[DEBUG] AppDatabase (SQLite) baslatiliyor...');
    try {
        store = new AppDatabase();
        console.log('[DEBUG] AppDatabase (SQLite) basariyla baslatildi.');
    } catch(e) {
        console.error('[DEBUG] AppDatabase (SQLite) baslatilirken HATA:', e);
    }

    console.log('[DEBUG] IPC handlers kaydediliyor...');
    registerIpc();
    console.log('[DEBUG] MainWindow olusturuluyor...');
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
    console.log('[DEBUG] app.whenReady() islemleri tamamlandi.');
});

app.on('window-all-closed', () => {
    console.log('[DEBUG] app.on(window-all-closed) tetiklendi.');
    try { mpv?.quit(); } catch { /* yoksay */ }
    store?.close();
    app.quit();
});

app.on('before-quit', () => {
    console.log('[DEBUG] app.on(before-quit) tetiklendi.');
    try { mpv?.quit(); } catch { /* yoksay */ }
    store?.close();
});
