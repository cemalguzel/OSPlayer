import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { bridge } from '../lib/ipc';

/**
 * Gömülü MPV kontrol kancası.
 * - `regionRef` ile verilen div'in konumu video penceresine aktarılır
 * - mpv property/event akışı state'e yansıtılır
 * - Overlay durumu ayrıca ekran bileşenleri tarafından `sendOverlay` ile yayınlanır
 */

export interface MpvTrack {
    id: number;
    type: 'audio' | 'sub' | 'video';
    title?: string;
    lang?: string;
    selected?: boolean;
}

export interface PlayerState {
    paused: boolean;
    buffering: boolean;
    positionSecs: number;
    durationSecs: number;
    speed: number;
    volume: number;
    muted: boolean;
    audioTracks: MpvTrack[];
    subTracks: MpvTrack[];
    eof: boolean;
    error: string | null;
    mediaTitle: string;
    videoCodec?: string;
}

const INITIAL: PlayerState = {
    paused: false,
    buffering: false,
    positionSecs: 0,
    durationSecs: 0,
    speed: 1,
    volume: 100,
    muted: false,
    audioTracks: [],
    subTracks: [],
    eof: false,
    error: null,
    mediaTitle: '',
    videoCodec: '',
};

interface RawTrack {
    id: number;
    type: string;
    title?: string;
    lang?: string;
    selected?: boolean;
}

let globalActivePlayerId = 0;

export function usePlayer(regionRef: React.RefObject<HTMLElement | null>, active: boolean) {
    const id = useMemo(() => ++globalActivePlayerId, []);
    const [state, setState] = useState<PlayerState>(INITIAL);
    const stateRef = useRef(state);
    stateRef.current = state;

    // --- mpv event akışı ---
    useEffect(() => {
        if (!active) return;
        globalActivePlayerId = id;
        const off = bridge().mpv.onEvent((raw) => {
            if (globalActivePlayerId !== id) return;
            const ev = raw as { type: string; name?: string; value?: unknown; event?: string; data?: unknown };
            if (ev.type === 'property') {
                setState((s) => {
                    switch (ev.name) {
                        case 'time-pos':
                            return { ...s, positionSecs: typeof ev.value === 'number' ? ev.value : 0 };
                        case 'duration':
                            return { ...s, durationSecs: typeof ev.value === 'number' ? ev.value : 0 };
                        case 'pause':
                            return { ...s, paused: !!ev.value };
                        case 'paused-for-cache':
                            return { ...s, buffering: !!ev.value };
                        case 'speed':
                            return { ...s, speed: typeof ev.value === 'number' ? ev.value : 1 };
                        case 'volume':
                            return { ...s, volume: typeof ev.value === 'number' ? ev.value : 100 };
                        case 'mute':
                            return { ...s, muted: !!ev.value };
                        case 'eof-reached':
                            return { ...s, eof: !!ev.value };
                        case 'media-title':
                            return { ...s, mediaTitle: typeof ev.value === 'string' ? ev.value : '' };
                        case 'track-list': {
                            const list = Array.isArray(ev.value) ? (ev.value as RawTrack[]) : [];
                            return {
                                ...s,
                                audioTracks: list
                                    .filter((t) => t.type === 'audio')
                                    .map((t) => ({ ...t, type: 'audio' as const })),
                                subTracks: list
                                    .filter((t) => t.type === 'sub')
                                    .map((t) => ({ ...t, type: 'sub' as const })),
                            };
                        }
                        default:
                            return s;
                    }
                });
            } else if (ev.type === 'event' && ev.event === 'playback-restart') {
                setState((s) => ({ ...s, buffering: false, eof: false, error: null }));
            } else if (ev.type === 'status' && ev.event === 'error') {
                setState((s) => ({ ...s, error: String(ev.data ?? 'Oynatıcı hatası') }));
            }
        });
        return off;
    }, [active, id]);

    // --- video bölgesi takibi ---
    useEffect(() => {
        if (!active || !regionRef.current) return;
        const el = regionRef.current;
        let lastKey = '';
        const report = () => {
            if (globalActivePlayerId !== id) return;
            const r = el.getBoundingClientRect();
            // Konum DEĞİŞMEDİYSE gönderme — yoksa 500ms'lik emniyet döngüsü her seferinde
            // aynı bounds'u yollayıp IPC'yi (ve logları) gereksiz yere doldurur.
            const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
            if (key === lastKey) return;
            lastKey = key;
            void bridge().player.setBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
        };
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        const iv = setInterval(report, 500); // layout kaymalarına karşı emniyet (yalnızca değişince gönderir)
        return () => {
            ro.disconnect();
            clearInterval(iv);
        };
    }, [active, regionRef, id]);

    // --- görünürlük ---
    useEffect(() => {
        if (!active) return;
        globalActivePlayerId = id;
        void bridge().player.show();
        return () => {
            // Ekrandan çıkışta MPV'yi DAİMA kapat (arka planda bağlantı kalmasın).
            // Eskiden `globalActivePlayerId === id` kapısı vardı; başka bir
            // usePlayer örneği sahipliği çalınca teardown atlanıyor ve yayın
            // arka planda bağlı kalıyordu (canlı/film çıkışında bağlantı kesilmiyordu).
            void bridge().player.hide();
        };
    }, [active, id]);

    const load = useCallback(async (url: string) => {
        globalActivePlayerId = id;
        setState((s) => ({ ...INITIAL, volume: s.volume, muted: s.muted }));
        // MPV'nin hazır olmasını bekle, sonra URL'yi yükle
        await bridge().player.show();
        await bridge().mpv.load(url);
    }, [id]);

    const cmd = useCallback((c: unknown[]) => bridge().mpv.command(c), []);

    return {
        state,
        load,
        stop: useCallback(() => {
            // Çıkış/unmount'ta akışı DAİMA durdur — sahiplik kapısına bağlama;
            // aksi halde başka bir örnek aktifken çıkışta yayın bağlı kalıyor.
            bridge().mpv.stop();
        }, []),
        togglePause: useCallback(
            () => cmd(['set_property', 'pause', !stateRef.current.paused]),
            [cmd]
        ),
        seekRelative: useCallback((secs: number) => cmd(['seek', secs, 'relative']), [cmd]),
        seekAbsolute: useCallback((secs: number) => cmd(['seek', secs, 'absolute']), [cmd]),
        setSpeed: useCallback((v: number) => cmd(['set_property', 'speed', v]), [cmd]),
        setVolume: useCallback(async (v: number) => {
            if (!Number.isFinite(v)) return;
            const volume = Math.max(0, Math.min(100, v));
            stateRef.current = { ...stateRef.current, volume };
            setState(s => ({ ...s, volume }));
            await cmd(['set_property', 'volume', volume]);
        }, [cmd]),
        toggleMute: useCallback(async () => {
            const muted = !stateRef.current.muted;
            stateRef.current = { ...stateRef.current, muted };
            setState(s => ({ ...s, muted }));
            await cmd(['set_property', 'mute', muted]);
        }, [cmd]),
        setAudioTrack: useCallback((id: number) => cmd(['set_property', 'aid', id]), [cmd]),
        setSubTrack: useCallback((id: number | 'no') => cmd(['set_property', 'sid', id]), [cmd]),
        setAspect: useCallback(
            (v: string) => cmd(['set_property', 'video-aspect-override', v]), // "-1" | "16:9" | "4:3" | "2.35:1"
            [cmd]
        ),
        setPanScan: useCallback((v: number) => cmd(['set_property', 'panscan', v]), [cmd]),
        sendOverlay: useCallback((state: unknown) => {
            try {
                bridge().overlay.update(state);
            } catch {
                /* yoksay */
            }
        }, []),
    };
}

export type PlayerApi = ReturnType<typeof usePlayer>;

/** Overlay penceresine durum yayınla (mainWindow tarafından çağrılır) */
let lastOverlayJson = '';
export function sendOverlay(state: unknown): void {
    try {
        // Aynı durumu tekrar yollama — pozisyon yoklaması player.state'i sık
        // değiştirip overlay effect'lerini tetikliyor; değişmeyen payload IPC'yi
        // (ve logları) gereksiz doldurur.
        const json = JSON.stringify(state);
        if (json === lastOverlayJson) return;
        lastOverlayJson = json;
        bridge().overlay.update(state);
    } catch {
        /* yoksay */
    }
}
