import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

/**
 * HTML5 <video> + HLS.js tabanlı oynatıcı hook'u.
 * MPV --wid embedding yerine kullanılır — Electron renderer içinde doğrudan çalışır.
 */

export interface HtmlTrack {
    id: number;
    type: 'audio' | 'sub' | 'video';
    title?: string;
    lang?: string;
    selected?: boolean;
}

export interface HtmlPlayerState {
    paused: boolean;
    buffering: boolean;
    positionSecs: number;
    durationSecs: number;
    speed: number;
    volume: number;
    muted: boolean;
    audioTracks: HtmlTrack[];
    subTracks: HtmlTrack[];
    eof: boolean;
    error: string | null;
    mediaTitle: string;
    /** Aktif video codec etiketi (bayi APK kalite rozeti: "H264"/"HEVC"...) — sadece HLS'te dolu */
    videoCodec: string;
}

/** HLS codec string'ini bayi APK rozet etiketine çevirir (avc1.64001f → H264) */
function codecLabel(c?: string): string {
    if (!c) return '';
    const lc = c.toLowerCase();
    if (lc.includes('avc') || lc.includes('h264')) return 'H264';
    if (lc.includes('hvc') || lc.includes('hev') || lc.includes('h265')) return 'HEVC';
    if (lc.includes('vp9')) return 'VP9';
    if (lc.includes('av01') || lc.includes('av1')) return 'AV1';
    return c.split('.')[0].toUpperCase();
}

const INITIAL: HtmlPlayerState = {
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

export function useHtmlPlayer(videoRef: React.RefObject<HTMLVideoElement | null>, active: boolean) {
    const [state, setState] = useState<HtmlPlayerState>(INITIAL);
    const hlsRef = useRef<Hls | null>(null);
    const stateRef = useRef(state);
    stateRef.current = state;

    const getVideo = () => videoRef.current;

    // HLS.js başlat
    useEffect(() => {
        if (!active) return;
        return () => {
            hlsRef.current?.destroy();
            hlsRef.current = null;
        };
    }, [active]);

    // Video element event'leri
    useEffect(() => {
        if (!active) return;
        const vid = getVideo();
        if (!vid) return;

        const onTimeUpdate = () => setState(s => ({ ...s, positionSecs: vid.currentTime }));
        const onDurationChange = () => setState(s => ({ ...s, durationSecs: isFinite(vid.duration) ? vid.duration : 0 }));
        const onPause = () => setState(s => ({ ...s, paused: true }));
        const onPlay = () => setState(s => ({ ...s, paused: false, error: null }));
        const onWaiting = () => setState(s => ({ ...s, buffering: true }));
        const onPlaying = () => setState(s => ({ ...s, buffering: false, paused: false }));
        const onEnded = () => setState(s => ({ ...s, eof: true }));
        const onVolumeChange = () => setState(s => ({ ...s, volume: vid.volume * 100, muted: vid.muted }));
        const onRateChange = () => setState(s => ({ ...s, speed: vid.playbackRate }));
        const onError = () => {
            const err = vid.error;
            let urlInfo = vid.src;
            try {
                const u = new URL(vid.src);
                urlInfo += u.port ? ` (Port: ${u.port})` : '';
            } catch { /* yoksay */ }
            setState(s => ({ ...s, error: `Video hatası: ${err ? err.message || err.code : 'Bilinmeyen video hatası'} | Hedef: ${urlInfo}`, buffering: false }));
        };

        const onLoadedMetadata = () => {
            const aTracks: HtmlTrack[] = [];
            const sTracks: HtmlTrack[] = [];
            
            // Native HTML5 API
            if ('audioTracks' in vid && (vid as any).audioTracks) {
                const at = (vid as any).audioTracks;
                for (let i = 0; i < at.length; i++) {
                    aTracks.push({
                        id: i,
                        type: 'audio',
                        title: at[i].label || `Ses ${i + 1}`,
                        lang: at[i].language,
                        selected: at[i].enabled
                    });
                }
            }
            if (vid.textTracks) {
                for (let i = 0; i < vid.textTracks.length; i++) {
                    const t = vid.textTracks[i];
                    sTracks.push({
                        id: i,
                        type: 'sub',
                        title: t.label || `Altyazı ${i + 1}`,
                        lang: t.language,
                        selected: t.mode === 'showing'
                    });
                }
            }
            
            setState(s => {
                if (hlsRef.current && (s.audioTracks.length > 0 || s.subTracks.length > 0)) {
                    return s; // HLS eventleri önceliklidir
                }
                return { ...s, audioTracks: aTracks, subTracks: sTracks };
            });
        };

        vid.addEventListener('timeupdate', onTimeUpdate);
        vid.addEventListener('durationchange', onDurationChange);
        vid.addEventListener('pause', onPause);
        vid.addEventListener('play', onPlay);
        vid.addEventListener('waiting', onWaiting);
        vid.addEventListener('playing', onPlaying);
        vid.addEventListener('ended', onEnded);
        vid.addEventListener('volumechange', onVolumeChange);
        vid.addEventListener('ratechange', onRateChange);
        vid.addEventListener('error', onError);
        vid.addEventListener('loadedmetadata', onLoadedMetadata);

        return () => {
            vid.removeEventListener('timeupdate', onTimeUpdate);
            vid.removeEventListener('durationchange', onDurationChange);
            vid.removeEventListener('pause', onPause);
            vid.removeEventListener('play', onPlay);
            vid.removeEventListener('waiting', onWaiting);
            vid.removeEventListener('playing', onPlaying);
            vid.removeEventListener('ended', onEnded);
            vid.removeEventListener('volumechange', onVolumeChange);
            vid.removeEventListener('ratechange', onRateChange);
            vid.removeEventListener('error', onError);
            vid.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, [active, videoRef]);

    const load = useCallback(async (url: string) => {
        const vid = getVideo();
        if (!vid) return;

        // Önceki yerel (native) oynatmayı ve buffer'ı durdur
        vid.pause();
        vid.removeAttribute('src');

        // Önceki HLS instance'ı temizle
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }

        setState({ ...INITIAL });

        const isHls = url.includes('.m3u8') || url.includes('m3u8') || url.endsWith('/');

        if (isHls && Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                xhrSetup: (xhr) => {
                    xhr.withCredentials = false;
                },
            });
            hlsRef.current = hls;
            hls.loadSource(url);
            hls.attachMedia(vid);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                void vid.play().catch(() => undefined);
            });
            // Aktif seviyenin codec'i — canlı TV kalite rozeti (bayi APK paritesi)
            hls.on(Hls.Events.LEVEL_SWITCHED, (_ev, data) => {
                const lvl = hls.levels[data.level];
                setState(s => ({ ...s, videoCodec: codecLabel(lvl?.videoCodec) }));
            });
            hls.on(Hls.Events.ERROR, (_ev, data) => {
                if (data.fatal) {
                    setState(s => ({ ...s, error: `HLS hatası: ${data.type} - ${data.details}`, buffering: false }));
                }
            });
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_ev, data) => {
                const aTracks = data.audioTracks.map((t, i) => ({
                    id: t.id,
                    type: 'audio' as const,
                    title: t.name || `Ses ${i+1}`,
                    lang: t.lang,
                    selected: t.default
                }));
                setState(s => ({ ...s, audioTracks: aTracks }));
            });
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_ev, data) => {
                const sTracks = data.subtitleTracks.map((t, i) => ({
                    id: t.id,
                    type: 'sub' as const,
                    title: t.name || `Altyazı ${i+1}`,
                    lang: t.lang,
                    selected: t.default
                }));
                setState(s => ({ ...s, subTracks: sTracks }));
            });
        } else {
            // Doğrudan mp4/ts vs.
            vid.src = url;
            void vid.play().catch(() => undefined);
        }
    }, [videoRef]);

    const stop = useCallback(() => {
        const vid = getVideo();
        if (!vid) return;
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        vid.pause();
        // `src = ''` yerine attribute'u kaldırıp load() çağırmak, devam eden ağ
        // isteğini (özellikle sonsuz canlı TS akışını) ANINDA iptal eder; aksi halde
        // boş string geçerli sayılıp bağlantı arka planda bir süre asılı kalabiliyordu.
        vid.removeAttribute('src');
        vid.load();
        setState(INITIAL);
    }, [videoRef]);

    const togglePause = useCallback(() => {
        const vid = getVideo();
        if (!vid) return;
        if (vid.paused) void vid.play().catch(() => undefined);
        else vid.pause();
    }, [videoRef]);

    const seekRelative = useCallback((secs: number) => {
        const vid = getVideo();
        if (!vid) return;
        vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + secs));
    }, [videoRef]);

    const seekAbsolute = useCallback((secs: number) => {
        const vid = getVideo();
        if (!vid) return;
        vid.currentTime = Math.max(0, Math.min(vid.duration || 0, secs));
    }, [videoRef]);

    const setSpeed = useCallback((v: number) => {
        const vid = getVideo();
        if (vid) vid.playbackRate = v;
    }, [videoRef]);

    const setVolume = useCallback((v: number) => {
        const vid = getVideo();
        if (vid) vid.volume = Math.max(0, Math.min(1, v / 100));
    }, [videoRef]);

    const toggleMute = useCallback(() => {
        const vid = getVideo();
        if (vid) vid.muted = !vid.muted;
    }, [videoRef]);

    // Audio track seçimi (HLS.js veya Native üzerinden)
    const setAudioTrack = useCallback((id: number) => {
        const hls = hlsRef.current;
        if (hls) {
            hls.audioTrack = id;
        } else {
            const vid = getVideo();
            if (vid && 'audioTracks' in vid && (vid as any).audioTracks) {
                const at = (vid as any).audioTracks;
                for (let i = 0; i < at.length; i++) {
                    at[i].enabled = (i === id);
                }
            }
        }
        setState(s => ({
            ...s,
            audioTracks: s.audioTracks.map((t, i) => ({ ...t, selected: t.id === id || i === id }))
        }));
    }, []);

    // Altyazı (video element TextTrack veya HLS.js)
    const setSubTrack = useCallback((id: number | 'no') => {
        const hls = hlsRef.current;
        if (hls) {
            hls.subtitleTrack = id === 'no' ? -1 : id;
        } else {
            const vid = getVideo();
            if (vid && vid.textTracks) {
                for (let i = 0; i < vid.textTracks.length; i++) {
                    vid.textTracks[i].mode = (i === id) ? 'showing' : 'hidden';
                }
            }
        }
        setState(s => ({
            ...s,
            subTracks: s.subTracks.map((t, i) => ({ ...t, selected: t.id === id || i === id }))
        }));
    }, []);

    const setAspect = useCallback((_v: string) => {
        // CSS ile kontrol edilir
    }, []);

    const setPanScan = useCallback((_v: number) => {
        // CSS ile kontrol edilir
    }, []);

    return {
        state,
        load,
        stop,
        togglePause,
        seekRelative,
        seekAbsolute,
        setSpeed,
        setVolume,
        toggleMute,
        setAudioTrack,
        setSubTrack,
        setAspect,
        setPanScan,
        cmd: (_c: unknown[]) => Promise.resolve(null),
    };
}

export type HtmlPlayerApi = ReturnType<typeof useHtmlPlayer>;
