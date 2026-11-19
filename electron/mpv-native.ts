/**
 * mpv-native.ts  —  libmpv-2.dll üzerinden Native addon sarmalayıcı.
 *
 * MpvNative sınıfı, MpvManager (mpv.exe IPC) ile aynı public arayüzü sunar.
 * Bu sayede main.ts içinde ikisi arasında şeffaf geçiş yapılabilir.
 */

import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// ── Addon türleri ────────────────────────────────────────────────────────────
interface MpvAddon {
    create(): bigint;
    initialize(h: bigint): void;
    terminate(h: bigint): void;
    destroy(h: bigint): void;
    clientApiVersion(): number;
    errorString(code: number): string;
    setOptionString(h: bigint, key: string, val: string): void;
    setWid(h: bigint, hwnd: bigint): void;
    commandString(h: bigint, cmd: string): void;
    command(h: bigint, args: string[]): void;
    getPropertyString(h: bigint, name: string): string | null;
    setPropertyString(h: bigint, name: string, val: string): void;
    setPropertyBool(h: bigint, name: string, val: boolean): void;
    setPropertyDouble(h: bigint, name: string, val: number): void;
    getPropertyDouble(h: bigint, name: string): number | null;
    getPropertyBool(h: bigint, name: string): boolean | null;
    observeProperty(h: bigint, id: number, name: string): void;
    waitEvent(h: bigint, timeoutMs: number): MpvRawEvent | null;
    
    // Windows Child HWND Yönetimi
    createVideoWindow(parentHwnd: bigint): bigint | null;
    resizeVideoWindow(hwnd: bigint, x: number, y: number, w: number, h: number): void;
    destroyVideoWindow(hwnd: bigint): void;
}

interface MpvRawEvent {
    id: number;
    name: string;
    error: number;
    property?: { name: string; replyId: number; value: string | null };
    endFile?: { reason: number; error: number };
}

// ── MpvEvent (main.ts ile uyumlu) ───────────────────────────────────────────
export interface MpvEvent {
    type: 'property' | 'event' | 'status';
    name?: string;
    value?: unknown;
    event?: string;
    data?: unknown;
}

type EventCallback = (ev: MpvEvent) => void;

// ── Addon yükleme ─────────────────────────────────────────────────────────────
function loadAddon(): MpvAddon {
    // Önce DLL'in PATH'te olduğundan emin ol
    const dllDir = app.isPackaged
        ? process.resourcesPath
        : path.join(app.getAppPath(), 'resources', 'mpv', 'win');

    if (process.platform === 'win32') {
        const dllPath = path.join(dllDir, 'libmpv-2.dll');
        if (!fs.existsSync(dllPath)) {
            throw new Error(`libmpv-2.dll bulunamadı: ${dllPath}`);
        }
        // Node.js DLL arama yoluna ekle (LoadLibrary için)
        process.env.PATH = dllDir + ';' + (process.env.PATH ?? '');
    }

    // .node dosyasının yolu
    const addonPath = app.isPackaged
        ? path.join(process.resourcesPath, 'mpv_addon.node')
        : path.join(app.getAppPath(), 'mpv-addon', 'build', 'Release', 'mpv_addon.node');

    if (!fs.existsSync(addonPath)) {
        throw new Error(`mpv_addon.node bulunamadı: ${addonPath}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(addonPath) as MpvAddon;
}

// ── Gözlemlenen property listesi ──────────────────────────────────────────────
const OBSERVED_PROPS = [
    'time-pos',
    'duration',
    'pause',
    'paused-for-cache',
    'core-idle',
    'seeking',
    'eof-reached',
    'track-list',
    'video-params',
    'volume',
    'mute',
    'speed',
    'media-title',
];

// ── MpvNative ─────────────────────────────────────────────────────────────────
export class MpvNative {
    private addon: MpvAddon;
    private handle: bigint | null = null;
    private onEvent: EventCallback;
    private userAgent: string;
    private eventLoop: NodeJS.Timeout | null = null;
    private posTimer: NodeJS.Timeout | null = null;
    private _isRunning = false;
    private childHwnd: bigint | null = null;

    constructor(onEvent: EventCallback, userAgent: string) {
        this.onEvent = onEvent;
        this.userAgent = userAgent;
        this.addon = loadAddon();
    }

    get isRunning(): boolean {
        return this._isRunning && this.handle !== null;
    }

    /** MPV'yi başlat ve verilen HWND'ye göm */
    async start(initBounds: { x: number; y: number; width: number; height: number; wid?: number }): Promise<void> {
        if (this._isRunning) return;

        const h = this.addon.create();
        let initialized = false;
        try {

        // Tek bir geçersiz seçenek tüm başlatmayı (ve istisnalar açıkken bile MPV'yi)
        // bozmasın diye her setOptionString güvenli sarmalanır.
        // NOT: libmpv'nin mpv_set_option_string API'si "no-xxx" önekini DESTEKLEMEZ
        // (o sadece komut satırı ayrıştırıcısına özgüdür). Bu yüzden tüm bayraklar
        // "ad=değer" biçiminde verilir; aksi halde MPV_ERROR_OPTION_NOT_FOUND döner.
        const opt = (key: string, val: string) => {
            try { this.addon.setOptionString(h, key, val); }
            catch (e) { console.warn(`[MPVNative] setOption '${key}' atlandı:`, e); }
        };

        // ── Temel seçenekler ──────────────────────────────────────────────
        opt('idle',                     'yes');
        opt('keep-open',                'yes');
        opt('osc',                      'no');
        opt('osd-level',                '0');
        opt('input-default-bindings',   'no');
        opt('input-vo-keyboard',        'no');
        opt('input-cursor',             'no');
        opt('cursor-autohide',          'always');
        opt('config',                   'no');
        opt('msg-level',                'all=warn');

        // ── Ağ ───────────────────────────────────────────────────────────
        opt('network-timeout',          '15');
        opt('cache',                    'yes');
        opt('demuxer-max-bytes',        '32MiB');
        opt('demuxer-readahead-secs',   '8');
        opt('user-agent',               this.userAgent);
        opt('force-seekable',           'yes');
        opt('tls-verify',               'no');

        // ── Video output ─────────────────────────────────────────────────
        opt('vo', process.platform === 'darwin' ? 'libmpv' : 'gpu');
        opt('hwdec',  'no');

        // ── HWND embed (Çakışmayı önlemek için Child HWND) ───────────────
        if (initBounds.wid) {
            try {
                this.childHwnd = this.addon.createVideoWindow(BigInt(initBounds.wid));
                if (this.childHwnd) {
                    this.addon.setWid(h, this.childHwnd);
                    this.addon.resizeVideoWindow(this.childHwnd, initBounds.x, initBounds.y, initBounds.width, initBounds.height);
                } else {
                    this.addon.setWid(h, BigInt(initBounds.wid)); // Fallback
                }
            } catch (e) {
                console.error('[MPVNative] HWND oluşturma hatası:', e);
                this.addon.setWid(h, BigInt(initBounds.wid));
            }
        }

        this.addon.initialize(h);
        initialized = true;
        this.handle = h;
        this._isRunning = true;

        // ── Property gözlemleme (initialize'DAN SONRA olmalı!) ───────────────
        // mpv_observe_property yalnızca initialize sonrası çalışır; önce çağrılırsa
        // hata verir ve hiçbir property-change olayı gelmez → time-pos/duration/pause
        // hiç güncellenmez (ilerleme çubuğu/süre 0 kalır).
        OBSERVED_PROPS.forEach((prop, idx) => {
            try { this.addon.observeProperty(h, idx + 1, prop); } catch (e) {
                console.warn(`[MPVNative] observe '${prop}' hatası:`, e);
            }
        });

        // Event polling loop (non-blocking: 0ms timeout, setImmediate benzeri)
        this.startEventLoop();
        // Pozisyon/süre periyodik çekme — gözlem (observe) olayları bu kurulumda
        // güvenilir gelmediği için time-pos/duration/pause'ı doğrudan property
        // okuyarak yayınla (ilerleme çubuğu + süre buradan dolar).
        this.startPositionPolling();

        this.onEvent({ type: 'status', event: 'started' });
        console.log('[MPVNative] Yerel MPV başlatıldı. API:', this.addon.clientApiVersion());
        } catch(error) {
            if(this.eventLoop) clearTimeout(this.eventLoop);
            if(this.posTimer) clearInterval(this.posTimer);
            this.eventLoop=null; this.posTimer=null; this.handle=null; this._isRunning=false;
            try { if(initialized) this.addon.terminate(h); else this.addon.destroy(h); } catch {}
            if(this.childHwnd) {try{this.addon.destroyVideoWindow(this.childHwnd);}catch{} this.childHwnd=null;}
            throw error;
        }
    }

    // ── Pozisyon/süre periyodik çekme ───────────────────────────────────────
    private startPositionPolling() {
        if (this.posTimer) clearInterval(this.posTimer);
        this.posTimer = setInterval(() => {
            if (!this.handle || !this._isRunning) return;
            try {
                const pos = this.addon.getPropertyDouble(this.handle, 'time-pos');
                if (pos !== null && isFinite(pos)) this.onEvent({ type: 'property', name: 'time-pos', value: pos });
                const dur = this.addon.getPropertyDouble(this.handle, 'duration');
                if (dur !== null && isFinite(dur)) this.onEvent({ type: 'property', name: 'duration', value: dur });
                const paused = this.addon.getPropertyBool(this.handle, 'pause');
                if (paused !== null) this.onEvent({ type: 'property', name: 'pause', value: paused });
                const volume = this.addon.getPropertyDouble(this.handle, 'volume');
                if (volume !== null && Number.isFinite(volume)) this.onEvent({ type: 'property', name: 'volume', value: volume });
                const muted = this.addon.getPropertyBool(this.handle, 'mute');
                if (muted !== null) this.onEvent({ type: 'property', name: 'mute', value: muted });
                const cache = this.addon.getPropertyBool(this.handle, 'paused-for-cache');
                if (cache !== null) this.onEvent({ type: 'property', name: 'paused-for-cache', value: cache });
            } catch { /* yoksay */ }
        }, 500);
    }

    // ── Event Loop ────────────────────────────────────────────────────────
    private startEventLoop() {
        const poll = () => {
            if (!this.handle || !this._isRunning) return;
            try {
                const ev = this.addon.waitEvent(this.handle, 0);
                if (ev) {
                    this.handleRawEvent(ev);
                    // Hemen bir sonraki event'i al (burst mode)
                    setImmediate(poll);
                    return;
                }
            } catch { /* mpv kapanmış olabilir */ }
            // Event yoksa 50ms sonra tekrar dene
            this.eventLoop = setTimeout(poll, 50);
        };
        setImmediate(poll);
    }

    /**
     * track-list'i alt-property'lerden gerçek diziye çevirir.
     * libmpv'nin get_property_string'i track-list'i (node tipi) string döndürür;
     * renderer ise Array bekler — bu yüzden track-list/N/... yollarıyla okuyup
     * diziye dönüştürüyoruz (ses/altyazı menüleri ancak böyle dolar).
     */
    private readTrackList(): Array<{ id: number; type: string; title?: string; lang?: string; selected: boolean }> {
        if (!this.handle) return [];
        const h = this.handle;
        const gs = (name: string) => {
            try { return this.addon.getPropertyString(h, name); } catch { return null; }
        };
        const count = parseInt(gs('track-list/count') ?? '0', 10);
        const out: Array<{ id: number; type: string; title?: string; lang?: string; selected: boolean }> = [];
        for (let i = 0; i < count; i++) {
            const type = gs(`track-list/${i}/type`) ?? '';
            out.push({
                id: parseInt(gs(`track-list/${i}/id`) ?? '0', 10),
                type,
                title: gs(`track-list/${i}/title`) ?? undefined,
                lang: gs(`track-list/${i}/lang`) ?? undefined,
                selected: gs(`track-list/${i}/selected`) === 'yes',
            });
        }
        return out;
    }

    private emitTrackList() {
        this.onEvent({ type: 'property', name: 'track-list', value: this.readTrackList() });
    }

    /**
     * libmpv get_property_string her property'yi STRING döndürür; renderer ise
     * sayı/boolean bekler (time-pos, duration, pause...). Doğru tipe çevir, yoksa
     * ilerleme çubuğu/süre çalışmaz, pause/mute durumu yanlış olur.
     */
    private convertPropValue(name: string, raw: unknown): unknown {
        if (raw === null || raw === undefined) return raw;
        const s = String(raw);
        switch (name) {
            case 'time-pos':
            case 'duration':
            case 'speed':
            case 'volume': {
                const n = parseFloat(s);
                return isFinite(n) ? n : 0;
            }
            case 'pause':
            case 'mute':
            case 'paused-for-cache':
            case 'eof-reached':
            case 'core-idle':
            case 'seeking':
                return s === 'yes' || s === 'true';
            default:
                return raw;
        }
    }

    private handleRawEvent(ev: MpvRawEvent) {
        if (ev.id === 22 /* MPV_EVENT_PROPERTY_CHANGE */ && ev.property) {
            // track-list string olarak gelir; gerçek diziye çevirip yayınla
            if (ev.property.name === 'track-list') {
                this.emitTrackList();
                return;
            }
            this.onEvent({
                type: 'property',
                name: ev.property.name,
                value: this.convertPropValue(ev.property.name, ev.property.value),
            });
        } else if (ev.id === 7 /* MPV_EVENT_END_FILE */ && ev.endFile) {
            this.onEvent({ type: 'event', event: 'end-file', data: ev.endFile });
            if (ev.endFile.reason === 0) {
                this.onEvent({ type: 'property', name: 'eof-reached', value: true });
            }
        } else if (ev.id === 8 /* MPV_EVENT_FILE_LOADED */) {
            this.onEvent({ type: 'event', event: 'file-loaded', data: ev });
            // Dosya yüklenince parça listesini de yayınla (ses/altyazı dilleri)
            this.emitTrackList();
        } else if (ev.id === 11 /* MPV_EVENT_IDLE */) {
            this.onEvent({ type: 'event', event: 'idle', data: ev });
        } else {
            this.onEvent({ type: 'event', event: ev.name, data: ev });
        }
    }

    // ── Oynatıcı kontrolleri ─────────────────────────────────────────────
    async load(url: string): Promise<void> {
        if (!this.handle) throw new Error('MPV başlatılmadı');
        this.addon.command(this.handle, ['loadfile', url, 'replace']);
        // Kısa bir bekleme sonrası oynatmayı başlat
        setTimeout(() => {
            if (this.handle) {
                try { this.addon.setPropertyBool(this.handle, 'pause', false); } catch { /* yoksay */ }
            }
        }, 200);
    }

    async stop(): Promise<void> {
        if (!this.handle) return;
        try { this.addon.commandString(this.handle, 'stop'); } catch { /* yoksay */ }
    }

    async command(cmd: unknown[]): Promise<unknown> {
        if (!this.handle) return null;
        const h = this.handle;
        try {
            // libmpv'nin mpv_command API'si 'set_property'yi KOMUT olarak desteklemez
            // (yalnızca JSON IPC destekler). Bilinmeyen komut → hata → throw → çökme.
            // Doğru yol mpv_set_property'dir; setPropertyString hataya toleranslıdır.
            // mpv_set_property_string değeri property tipine göre kendi ayrıştırır
            // (sayı, bayrak, seçim hepsi string'den çözülür).
            if (cmd[0] === 'set_property' && typeof cmd[1] === 'string') {
                const name = cmd[1] as string;
                const val = cmd[2];
                const sval = typeof val === 'boolean' ? (val ? 'yes' : 'no') : String(val);
                if (name === 'volume') {
                    const volume = Number(val);
                    if (!Number.isFinite(volume)) return null;
                    this.addon.setPropertyDouble(h, name, Math.max(0, Math.min(100, volume)));
                } else if (name === 'mute' && typeof val === 'boolean') {
                    this.addon.setPropertyBool(h, name, val);
                } else this.addon.setPropertyString(h, name, sval);
                return null;
            }
            // Diğer komutlar (seek, cycle, loadfile, stop...) geçerli mpv komutlarıdır;
            // tüm argümanları güvenle string'e çevir (sayı/boolean native'i çökertir).
            const args = cmd.map((a) =>
                typeof a === 'boolean' ? (a ? 'yes' : 'no') : String(a)
            );
            this.addon.command(h, args);
            return null;
        } catch (e) {
            console.warn('[MPVNative] command error:', e);
            return null;
        }
    }

    quit(): void {
        this._isRunning = false;
        if (this.eventLoop) {
            clearTimeout(this.eventLoop);
            this.eventLoop = null;
        }
        if (this.posTimer) {
            clearInterval(this.posTimer);
            this.posTimer = null;
        }
        const h = this.handle;
        const child = this.childHwnd;
        this.handle = null;
        this.childHwnd = null;
        // Orphan pencereyi ANINDA ekran dışına/0 boyuta al — beyaz kalıntı hemen
        // kaybolsun. resizeVideoWindow eski addon'da da var, bu yüzden native
        // yeniden derleme olmadan bile çalışır.
        if (child) {
            try { this.addon.resizeVideoWindow(child, -32000, -32000, 1, 1); } catch { /* yoksay */ }
        }
        const destroyChild = () => {
            // MPV pencereyi bıraktıktan SONRA orphan child window'u tamamen yok et.
            if (child) {
                try { this.addon.destroyVideoWindow(child); } catch { /* yoksay */ }
            }
        };
        if (h) {
            // Akışı ANINDA boşalt: 'stop' komutu mevcut dosyayı/akışı kaldırır ve
            // demuxer'ın ağ bağlantısını derhal kapatır. Aksi halde bağlantı,
            // aşağıdaki 300ms'lik terminate beklemesi boyunca arka planda asılı
            // kalıyordu (canlı/film çıkışında bağlantı hemen kesilmiyordu).
            try { this.addon.commandString(h, 'stop'); } catch { /* yoksay */ }
            try { this.addon.commandString(h, 'quit'); } catch { /* yoksay */ }
            setTimeout(() => {
                try { this.addon.terminate(h); } catch { /* yoksay */ }
                destroyChild();
            }, 300);
        } else {
            destroyChild();
        }
        this.onEvent({ type: 'status', event: 'exited', data: 0 });
    }

    /** standalone mpv.exe gerektiren setWindowBounds — Child HWND için kullanılır */
    async setWindowBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
        if (this.childHwnd) {
            try {
                this.addon.resizeVideoWindow(this.childHwnd, bounds.x, bounds.y, bounds.width, bounds.height);
            } catch (e) {
                /* yoksay */
            }
        }
    }
}
