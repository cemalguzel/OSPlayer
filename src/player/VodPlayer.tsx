import { VolumeControl, FullscreenControl } from '../components/VolumeControl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHtmlPlayer } from './useHtmlPlayer';
import { usePlayer, sendOverlay } from './usePlayer';
import { useContentStore } from '../store/contentStore';
import { useAppStore } from '../store/appStore';
import { useT } from '../lib/i18n';

/** Bölümler paneli öğesi (bayi APK chapters: dizilerde sezonun bölüm listesi) */
export interface VodChapter {
    label: string;
    /** Şu an oynayan bölüm mü — panelde işaretlenir */
    current?: boolean;
}

export interface VodPlayerProps {
    title: string;
    url: string;
    positionKey: string;
    startAt?: number;
    isSeries?: boolean;
    hasNext?: boolean;
    onNext?: () => void;
    /** Bölümler paneli içeriği (bayi APK: "Bölüm N: Başlık" listesi) */
    chapters?: VodChapter[];
    /** Bölümler panelinden seçim — index sezon bölüm listesindeki sıra */
    onChapterSelect?: (index: number) => void;
    onExit: () => void;
}

/**
 * VOD/Dizi oynatıcı — info bar bayi APK VodInfoBar paritesi:
 * Satır 1: başlık + süre, Satır 2: altın sarısı seek bar (odaklanabilir, ±60sn),
 * Satır 3: [oran, hız] | [-10dk, -1dk, oynat(54), +1dk, +10dk] | [ses, altyazı, bölümler*, sonraki*]
 * Üst köşeler: geri (sol) + başa sar (sağ). 5 sn'de otomatik gizlenir.
 */

type MenuKind = 'audio' | 'sub' | 'speed' | 'chapters';
// Odak zinciri: seek bar + butonlar (bayi APK buton sırası)
type FocusKey =
    | 'seek'
    | 'aspect'
    | 'speed'
    | 'rw10'
    | 'rw1'
    | 'play'
    | 'fw1'
    | 'fw10'
    | 'mute'
    | 'audio'
    | 'sub'
    | 'chapters'
    | 'next';

const MENU_TITLES: Record<MenuKind, string> = {
    audio: 'Ses',
    sub: 'Altyazı',
    speed: 'Hız',
    chapters: 'BÖLÜMLER',
};
const MENU_WIDTHS: Record<MenuKind, number> = { audio: 420, sub: 420, speed: 300, chapters: 380 };

const ASPECTS = [
    { label: 'OTOMATİK', value: 'auto' },
    { label: '16:9', value: '16/9' },
    { label: '4:3', value: '4/3' },
    { label: 'DOLDUR', value: 'fill' },
];
// Bayi APK hız listesi (1.0x = "Normal")
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HIDE_AFTER_MS = 5000;
const SEEK_BAR_STEP = 60; // seek bar odaklıyken sol/sağ ±60 sn
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'Backspace'];
const ACCENT = 'var(--color-accent)'; // MidnightBlue (bayi APK)
const GOLD = '#FFD700';

function fmtTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) secs = 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface MenuItem {
    label: string;
    active: boolean;
    onSelect: () => void;
}

const ICONS = {
    play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>,
    fastRewind: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>,
    fastForward: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>,
    chapters: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>,
    aspect: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 12H5V7h14v10z"/></svg>,
    speed: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.28-10.43z"/><circle cx="12" cy="13" r="2"/></svg>,
    next: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>,
    audio: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>,
    sub: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/></svg>,
    reset: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>,
    back: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>,
};

/** Bayi APK CircleControlBtn — odaklıda MidnightBlue dolgu + kenarlık + glow */
function CircleBtn({
    size,
    iconSize,
    icon,
    label,
    focused,
    onClick,
}: {
    size: number;
    iconSize: number;
    icon: React.ReactNode;
    label?: string;
    focused: boolean;
    onClick: () => void;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center rounded-full cursor-pointer transition-all shrink-0"
            style={{
                width: size,
                height: size,
                background: focused ? 'rgba(var(--theme-accent-rgb),0.3)' : 'rgba(255,255,255,0.08)',
                border: focused ? `2px solid ${ACCENT}` : '2px solid rgba(255,255,255,0.1)',
                boxShadow: focused ? `0 0 ${Math.round(size * 0.8)}px rgba(var(--theme-accent-rgb),0.4)` : 'none',
                color: focused ? '#fff' : 'rgba(255,255,255,0.7)',
            }}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
            <span style={{ width: iconSize, height: iconSize }}>{icon}</span>
            {label && (
                <span style={{ fontSize: 8, lineHeight: '9px', fontWeight: 600 }}>{label}</span>
            )}
        </div>
    );
}

function VodPlayer({ title, url, positionKey, startAt, isSeries, hasNext, onNext, chapters, onChapterSelect, onExit }: VodPlayerProps) {
    const t = useT();
    const videoPlayerSetting = useAppStore(s => s.settings.videoPlayer) || 'html5';

    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const htmlApi = useHtmlPlayer(videoRef, videoPlayerSetting === 'html5');
    const mpvApi = usePlayer(containerRef, videoPlayerSetting === 'mpv');

    const player = videoPlayerSetting === 'html5' ? htmlApi : mpvApi;
    useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==='m' && !['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)){e.preventDefault();void player.toggleMute();}};window.addEventListener('keydown',h);return ()=>window.removeEventListener('keydown',h);},[player.toggleMute]);
    const { state, load, stop, togglePause, seekRelative, seekAbsolute, setSpeed, setAudioTrack, setSubTrack, setAspect, setPanScan } = player;

    const [controlsVisible, setControlsVisible] = useState(true);
    const [focused, setFocused] = useState<FocusKey>('play');
    const [menu, setMenu] = useState<MenuKind | null>(null);
    const [menuIndex, setMenuIndex] = useState(0);
    const [aspect, setAspectState] = useState('auto');
    const [dragRatio, setDragRatio] = useState<number | null>(null);
    const [showAutoNext, setShowAutoNext] = useState(false);
    const [autoNextCountdown, setAutoNextCountdown] = useState(30);
    const [autoNextFocus, setAutoNextFocus] = useState<'start' | 'cancel'>('start');

    useEffect(()=>{window.osplayer?.advertising.context({screen:isSeries?'series':'movies',fullscreen:!state.error,controls:controlsVisible||!!menu});return ()=>window.osplayer?.advertising.context({screen:'none',fullscreen:false,controls:true});},[isSeries,controlsVisible,menu,state.error]);

    const stateRef = useRef(state);
    stateRef.current = state;
    const controlsRef = useRef(controlsVisible);
    controlsRef.current = controlsVisible;
    const focusedRef = useRef(focused);
    focusedRef.current = focused;
    const menuRef = useRef(menu);
    menuRef.current = menu;
    const menuIndexRef = useRef(menuIndex);
    menuIndexRef.current = menuIndex;

    const buildMenu = useCallback((kind: MenuKind): MenuItem[] => {
        const s = stateRef.current;
        switch (kind) {
            case 'audio':
                if (!s.audioTracks.length)
                    return [{ label: t('Ses parçası bulunamadı'), active: false, onSelect: () => undefined }];
                return s.audioTracks.map((tr) => ({
                    label: tr.title || (tr.lang ? tr.lang.toUpperCase() : t('Parça {id}', { id: tr.id })),
                    active: !!tr.selected,
                    onSelect: () => void setAudioTrack(tr.id),
                }));
            case 'sub':
                return [
                    { label: t('Kapat'), active: !s.subTracks.some(tr => tr.selected), onSelect: () => void setSubTrack('no') },
                    ...s.subTracks.map(tr => ({
                        label: tr.title || (tr.lang ? tr.lang.toUpperCase() : t('Parça {id}', { id: tr.id })),
                        active: !!tr.selected,
                        onSelect: () => void setSubTrack(tr.id)
                    }))
                ];
            case 'speed':
                return SPEEDS.map((v) => ({
                    label: v === 1 ? t('Normal (1x)') : `${v}x`, // bayi APK: 1.0x özel etiket
                    active: Math.abs(s.speed - v) < 0.01,
                    onSelect: () => void setSpeed(v),
                }));
            case 'chapters':
                // Bayi APK: dizilerde sezonun bölüm listesi; seçilince o bölüme geçilir
                if (!chapters || !chapters.length)
                    return [{ label: t('Bölüm bilgisi bulunamadı'), active: false, onSelect: () => undefined }];
                return chapters.map((c, i) => ({
                    label: c.label,
                    active: !!c.current,
                    onSelect: () => { if (onChapterSelect) onChapterSelect(i); },
                }));
        }
    }, [setAudioTrack, setSubTrack, setSpeed, chapters, onChapterSelect, t]);

    useEffect(() => {
        if (videoPlayerSetting === 'html5') {
            sendOverlay({ visible: false });
            return;
        }

        const activeMenu = menu ? buildMenu(menu) : [];

        sendOverlay({
            visible: true,
            mode: isSeries ? 'vod' : 'vod',
            title,
            muted: state.muted, volume: state.volume,
            paused: state.paused,
            buffering: state.buffering,
            positionSecs: state.positionSecs,
            durationSecs: state.durationSecs,
            showInfoBar: controlsVisible,
            showControls: controlsVisible,
            focusedControl: focused,
            menu: menu ? {
                title: t(MENU_TITLES[menu]),
                items: activeMenu.map(it => ({ label: it.label, active: it.active })),
                focusedIndex: menuIndex,
            } : null,
            errorText: state.error,
            hasChapters: !!isSeries || (chapters?.length ?? 0) > 0,
            hasNext: (isSeries || hasNext) && !!onNext,
        });
    }, [videoPlayerSetting, title, isSeries, hasNext, onNext, chapters, state, controlsVisible, focused, menu, menuIndex, buildMenu, t]);

    const aspectRef = useRef(aspect);
    aspectRef.current = aspect;
    const exitedRef = useRef(false);
    const hideTimer = useRef<number | null>(null);
    const autoNextTriggeredRef = useRef(false);
    const showAutoNextRef = useRef(showAutoNext);
    showAutoNextRef.current = showAutoNext;
    const autoNextFocusRef = useRef(autoNextFocus);
    autoNextFocusRef.current = autoNextFocus;

    const showChaptersBtn = !!isSeries || (chapters?.length ?? 0) > 0;
    const focusChain: FocusKey[] = [
        'aspect', 'speed', 'rw10', 'rw1', 'play', 'fw1', 'fw10', 'mute', 'audio', 'sub',
        ...((showChaptersBtn ? ['chapters'] : []) as FocusKey[]),
        ...(((isSeries || hasNext) && onNext ? ['next'] : []) as FocusKey[]),
    ];
    const focusChainRef = useRef(focusChain);
    focusChainRef.current = focusChain;

    const poke = useCallback(() => {
        setControlsVisible(true);
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => {
            if (menuRef.current === null) {
                setControlsVisible(false);
            }
        }, HIDE_AFTER_MS);
    }, []);

    const savePos = useCallback(() => {
        const s = stateRef.current;
        if (s.durationSecs <= 0 || s.positionSecs <= 5) return;
        const cs = useContentStore.getState();
        if (s.eof || s.positionSecs / s.durationSecs > 0.97) cs.clearPosition(positionKey);
        else cs.setPosition(positionKey, s.positionSecs, s.durationSecs, title);
    }, [positionKey, title]);

    const exit = useCallback(() => {
        if (exitedRef.current) return;
        exitedRef.current = true;
        savePos();
        stop();
        onExit();
    }, [savePos, stop, onExit]);

    const cycleAspect = useCallback(() => {
        const idx = ASPECTS.findIndex((a) => a.value === aspectRef.current);
        setAspectState(ASPECTS[(idx + 1) % ASPECTS.length].value);
    }, []);

    const applyControl = useCallback((c: FocusKey | 'reset') => {
        if (c === 'mute') void player.toggleMute();
        else if (c === 'play') togglePause();
        else if (c === 'seek') togglePause();
        else if (c === 'next') { if (onNext) onNext(); }
        else if (c === 'reset') seekAbsolute(0);
        else if (c === 'aspect') cycleAspect(); // bayi APK: oran butonu menü açmaz, sıradakine geçer
        else if (c === 'rw10') seekRelative(-600);
        else if (c === 'rw1') seekRelative(-60);
        else if (c === 'fw1') seekRelative(60);
        else if (c === 'fw10') seekRelative(600);
        else {
            const items = buildMenu(c as MenuKind);
            const activeIdx = items.findIndex((i) => i.active);
            setMenuIndex(activeIdx >= 0 ? activeIdx : 0);
            setMenu(c as MenuKind);
        }
        poke();
    }, [togglePause, buildMenu, poke, onNext, seekAbsolute, seekRelative, cycleAspect, player.toggleMute]);

    // Video load
    useEffect(() => {
        void load(url);
    }, [load, url]);

    // Resume position
    const pendingSeek = useRef(startAt && startAt > 1 ? startAt : null);
    useEffect(() => {
        if (pendingSeek.current == null || state.durationSecs <= 0) return;
        const target = Math.min(pendingSeek.current, Math.max(0, state.durationSecs - 5));
        pendingSeek.current = null;
        seekAbsolute(target);
    }, [state.durationSecs, seekAbsolute]);

    // Auto save pos
    useEffect(() => {
        const iv = window.setInterval(savePos, 5000);
        return () => window.clearInterval(iv);
    }, [savePos]);

    // Dizi otomatik sonraki bölüm tetiği (bayi APK koşulları):
    // son 30 sn + süre > 120 sn + tek seferlik bayrak; 35 sn'den geriye sarılırsa sıfırlanır
    useEffect(() => {
        if (!(isSeries && hasNext && onNext)) return;
        const dur = state.durationSecs;
        const pos = state.positionSecs;
        if (dur <= 120) return;
        if (pos < dur - 35 && autoNextTriggeredRef.current) {
            autoNextTriggeredRef.current = false;
        }
        const remaining = dur - pos;
        if (remaining <= 30 && remaining > 0 && !autoNextTriggeredRef.current && !state.eof && !state.buffering) {
            autoNextTriggeredRef.current = true;
            setAutoNextCountdown(Math.max(1, Math.floor(remaining)));
            setAutoNextFocus('start');
            setShowAutoNext(true);
        }
    }, [state.positionSecs, state.durationSecs, isSeries, hasNext, onNext, state.eof, state.buffering]);

    useEffect(() => {
        if (!showAutoNext) return;
        const iv = window.setInterval(() => {
            setAutoNextCountdown(prev => {
                if (prev <= 1) {
                    window.clearInterval(iv);
                    setShowAutoNext(false);
                    if (onNext) onNext();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => window.clearInterval(iv);
    }, [showAutoNext, onNext]);

    // End of file -> exit or next
    useEffect(() => {
        if (!state.eof || exitedRef.current) return;
        if (isSeries && hasNext && onNext) {
            setShowAutoNext(false);
            onNext();
        } else {
            exitedRef.current = true;
            useContentStore.getState().clearPosition(positionKey);
            stop();
            onExit();
        }
    }, [state.eof, positionKey, stop, onExit, isSeries, hasNext, onNext]);

    // Mount/unmount
    useEffect(() => {
        if (videoPlayerSetting !== 'html5') {
            document.body.classList.add('video-playing-standalone');
        }
        poke();
        return () => {
            document.body.classList.remove('video-playing-standalone');
            if (hideTimer.current) window.clearTimeout(hideTimer.current);
            if (!exitedRef.current) {
                exitedRef.current = true;
                savePos();
                stop();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoPlayerSetting]);

    // Overlay penceresindeki fare tıklamaları (MPV modu) → oynatıcı eylemleri
    useEffect(() => {
        if (videoPlayerSetting === 'html5') return;
        if (!window.osplayer?.onEvent) return;
        const off = window.osplayer.onEvent('overlay:command', (raw) => {
            const c = raw as { type?: string; control?: string; index?: number; ratio?: number; value?: number };
            if (c.type === 'volume') { void player.setVolume(c.value ?? 100); if(stateRef.current.muted) void player.toggleMute(); poke(); return; }
            if (c.type === 'control' && c.control) {
                if (c.control === 'back') { exit(); return; }
                if (c.control === 'reset') { applyControl('reset'); return; }
                // Eski basit set (back10/fwd10) ile geriye dönük uyum
                const map: Record<string, FocusKey> = { back10: 'rw10', fwd10: 'fw10' };
                const key = (map[c.control] ?? c.control) as FocusKey;
                setFocused(key);
                applyControl(key);
            } else if (c.type === 'menuClose') {
                setMenu(null);
                poke();
            } else if (c.type === 'menuSelect' && menuRef.current) {
                const items = buildMenu(menuRef.current);
                items[c.index ?? -1]?.onSelect();
                setMenu(null);
                poke();
            } else if (c.type === 'seek' && stateRef.current.durationSecs > 0) {
                seekAbsolute((c.ratio ?? 0) * stateRef.current.durationSecs);
                poke();
            }
        });
        return off;
    }, [videoPlayerSetting, applyControl, buildMenu, poke, seekAbsolute, exit]);

    // Keyboard management
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!KEYS.includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            const k = e.key;

            // Otomatik sonraki bölüm penceresi açıkken tuşlar oraya gider
            if (showAutoNextRef.current) {
                if (k === 'ArrowLeft') setAutoNextFocus('start');
                else if (k === 'ArrowRight') setAutoNextFocus('cancel');
                else if (k === 'Enter' || k === ' ') {
                    setShowAutoNext(false);
                    if (autoNextFocusRef.current === 'start' && onNext) onNext();
                } else if (k === 'Escape' || k === 'Backspace') {
                    setShowAutoNext(false);
                }
                return;
            }

            if (k === 'Escape' || k === 'Backspace') {
                if (menuRef.current) { setMenu(null); poke(); }
                else if (controlsRef.current) { // bayi APK: geri önce info bar'ı kapatır
                    if (hideTimer.current) window.clearTimeout(hideTimer.current);
                    setControlsVisible(false);
                }
                else exit();
                return;
            }

            if (menuRef.current) {
                const items = buildMenu(menuRef.current);
                if (k === 'ArrowUp') setMenuIndex(Math.max(0, menuIndexRef.current - 1));
                else if (k === 'ArrowDown') setMenuIndex(Math.min(items.length - 1, menuIndexRef.current + 1));
                else if (k === 'Enter') {
                    items[Math.min(menuIndexRef.current, items.length - 1)]?.onSelect();
                    setMenu(null);
                }
                else if (k === 'ArrowLeft') { setMenu(null); poke(); }
                poke();
                return;
            }

            if (k === ' ') { togglePause(); poke(); return; }

            if (controlsRef.current) {
                const chain = focusChainRef.current;
                if (k === 'ArrowLeft' || k === 'ArrowRight') {
                    if (focusedRef.current === 'seek') {
                        // Seek bar odaklı: ±60 sn (bayi APK)
                        seekRelative(k === 'ArrowLeft' ? -SEEK_BAR_STEP : SEEK_BAR_STEP);
                    } else {
                        const idx = chain.indexOf(focusedRef.current);
                        const next = k === 'ArrowLeft' ? Math.max(0, idx - 1) : Math.min(chain.length - 1, idx + 1);
                        setFocused(chain[next]);
                    }
                    poke();
                } else if (k === 'ArrowUp') {
                    if (focusedRef.current !== 'seek') setFocused('seek');
                    poke();
                } else if (k === 'ArrowDown') {
                    if (focusedRef.current === 'seek') { setFocused('play'); poke(); }
                    else { if (hideTimer.current) window.clearTimeout(hideTimer.current); setControlsVisible(false); }
                } else if (k === 'Enter') applyControl(focusedRef.current);
                return;
            }

            // Info bar gizli: sol/sağ göster + sar, diğerleri göster (bayi APK)
            if (k === 'ArrowLeft') { seekRelative(-60); setFocused('play'); poke(); }
            else if (k === 'ArrowRight') { seekRelative(60); setFocused('play'); poke(); }
            else { setFocused('play'); poke(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [buildMenu, exit, poke, seekRelative, togglePause, applyControl, onNext]);

    // Aspect ratio calculation
    const aspectStyle: React.CSSProperties = (() => {
        if (aspect === 'fill') return { objectFit: 'cover' };
        if (aspect === '16/9') return { objectFit: 'contain', aspectRatio: '16/9' };
        if (aspect === '4/3') return { objectFit: 'contain', aspectRatio: '4/3' };
        return { objectFit: 'contain' };
    })();

    const displayRatio = dragRatio !== null ? dragRatio : (state.durationSecs > 0 ? (state.positionSecs / state.durationSecs) : 0);
    const progressPercent = Math.min(100, Math.max(0, displayRatio * 100));
    const displayTime = dragRatio !== null ? (dragRatio * state.durationSecs) : state.positionSecs;

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (state.durationSecs <= 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setDragRatio(ratio);
        seekAbsolute(ratio * state.durationSecs);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRatio === null || state.durationSecs <= 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setDragRatio(ratio);
        seekAbsolute(ratio * state.durationSecs);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRatio !== null && state.durationSecs > 0) {
            seekAbsolute(dragRatio * state.durationSecs);
        }
        setDragRatio(null);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const activeMenu = menu ? buildMenu(menu) : [];
    const seekFocused = focused === 'seek';

    return (
        <div
            ref={containerRef}
            data-focus-layer
            className={`vod-player-container fixed inset-0 z-50 bg-black`}
            style={{ cursor: controlsVisible ? 'default' : 'none' }}
            onClick={poke}
        >
            {/* Video */}
            {videoPlayerSetting === 'html5' && (
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ ...aspectStyle, background: '#000', pointerEvents: 'none' }}
                    autoPlay
                    playsInline
                />
            )}

            {/* Buffering spinner */}
            {state.buffering && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="osp-spinner" style={{ width: 56, height: 56 }} />
                </div>
            )}

            {/* Hata gösterimi HTML5 için burada olabilir, MPV için overlay kullanılıyor ama yine de dursun */}
            {state.error && videoPlayerSetting === 'html5' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div style={{ background: 'rgba(0,0,0,0.85)', borderRadius: 12, padding: '24px 32px', textAlign: 'center', maxWidth: 480 }}>
                        <div style={{ color: '#fff', fontWeight: 500, fontSize: 16 }}>⚠️ {state.error}</div>
                    </div>
                </div>
            )}

            {/* Üst köşe yüzen butonlar: geri (sol) + başa sar (sağ) — bayi APK */}
            {controlsVisible && videoPlayerSetting === 'html5' && (
                <div className="absolute top-0 left-0 right-0 flex justify-between items-start" style={{ zIndex: 60, padding: 20 }}>
                    <div
                        className="flex items-center justify-center rounded-full cursor-pointer transition-all"
                        style={{
                            width: 48, height: 48,
                            background: 'rgba(0,0,0,0.55)',
                            border: '1.5px solid rgba(255,255,255,0.25)',
                            color: '#fff'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}
                        onClick={(e) => { e.stopPropagation(); exit(); }}
                        title={t('Geri')}
                    >
                        <span style={{ width: 24, height: 24 }}>{ICONS.back}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div
                            className="flex items-center justify-center rounded-full cursor-pointer transition-all"
                            style={{
                                width: 48, height: 48,
                                background: 'rgba(0,0,0,0.55)',
                                border: '1.5px solid rgba(255,255,255,0.25)',
                                color: '#fff'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}
                            onClick={(e) => { e.stopPropagation(); applyControl('reset'); }}
                            title={t('Baştan Başlat')}
                        >
                            <span style={{ width: 24, height: 24 }}>{ICONS.reset}</span>
                        </div>
                        <div
                            className="flex items-center gap-2 rounded-full cursor-pointer transition-all px-4"
                            style={{
                                height: 48,
                                background: 'rgba(0,0,0,0.55)',
                                border: '1.5px solid rgba(255,255,255,0.25)',
                                color: '#fff'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.55)')}
                            onClick={(e) => { e.stopPropagation(); window.osplayer.app.toggleFullscreen(); }}
                            title={t('Tam Ekran')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('TAM EKRAN')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Alt info bar (bayi APK VodInfoBar) */}
            {controlsVisible && videoPlayerSetting === 'html5' && (
                <div
                    className="absolute left-0 right-0 bottom-0"
                    style={{
                        padding: '40px 20px 10px',
                        background: 'linear-gradient(to top, rgba(var(--theme-surface-rgb),0.94) 0%, rgba(var(--theme-surface-rgb),0.8) 50%, transparent 100%)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className="rounded-[14px]"
                        style={{
                            background: 'rgba(var(--theme-surface-rgb), 0.85)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            padding: '12px 16px',
                            backdropFilter: 'blur(10px)',
                        }}
                    >
                        {/* Satır 1: başlık + süre */}
                        <div className="flex justify-between items-center">
                            <div className="text-[18px] font-semibold text-white truncate" style={{ flex: 1 }}>{title}</div>
                            <div className="text-[15px] font-medium whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.75)', marginLeft: 12 }}>
                                {fmtTime(displayTime)} – {fmtTime(state.durationSecs)}
                            </div>
                        </div>

                        {/* Satır 2: seek bar (odaklanabilir, altın sarısı) */}
                        <div
                            className="relative flex items-center"
                            style={{ height: 28, cursor: 'pointer', touchAction: 'none' }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                        >
                            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.2)' }}>
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${progressPercent}%`,
                                        background: GOLD,
                                        transition: dragRatio !== null ? 'none' : 'width 0.1s linear',
                                    }}
                                />
                            </div>
                            <div
                                className="absolute rounded-full"
                                style={{
                                    width: seekFocused ? 22 : 18,
                                    height: seekFocused ? 22 : 18,
                                    background: GOLD,
                                    boxShadow: seekFocused ? '0 0 14px rgba(255,215,0,0.7)' : 'none',
                                    left: `calc(${progressPercent}% - ${seekFocused ? 11 : 9}px)`,
                                    transition: dragRatio !== null ? 'none' : 'left 0.1s linear',
                                    pointerEvents: 'none',
                                }}
                            />
                        </div>

                        {/* Satır 3: kontrol butonları — [oran, hız] | [-10dk -1dk OYNAT +1dk +10dk] | [ses, altyazı, bölümler*, sonraki*] */}
                        <div className="player-control-row flex items-center" style={{ marginTop: 4 }}>
                            {/* Sol bölge */}
                            <div className="flex items-center" style={{ gap: 8 }}>
                                <CircleBtn size={42} iconSize={20} icon={ICONS.aspect} focused={focused === 'aspect'} onClick={() => { setFocused('aspect'); applyControl('aspect'); }} />
                                <CircleBtn size={42} iconSize={20} icon={ICONS.speed} focused={focused === 'speed'} onClick={() => { setFocused('speed'); applyControl('speed'); }} />

                            </div>

                            {/* Orta bölge */}
                            <div className="flex-1 flex items-center justify-center" style={{ gap: 10 }}>
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastRewind} label={t('10 dk')} focused={focused === 'rw10'} onClick={() => { setFocused('rw10'); applyControl('rw10'); }} />
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastRewind} label={t('1 dk')} focused={focused === 'rw1'} onClick={() => { setFocused('rw1'); applyControl('rw1'); }} />
                                <CircleBtn size={54} iconSize={28} icon={state.paused ? ICONS.play : ICONS.pause} focused={focused === 'play'} onClick={() => { setFocused('play'); applyControl('play'); }} />
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastForward} label={t('1 dk')} focused={focused === 'fw1'} onClick={() => { setFocused('fw1'); applyControl('fw1'); }} />
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastForward} label={t('10 dk')} focused={focused === 'fw10'} onClick={() => { setFocused('fw10'); applyControl('fw10'); }} />
                            </div>

                            {/* Sağ bölge */}
                            <div className="flex items-center" style={{ gap: 8 }}>
                                
<CircleBtn size={42} iconSize={20} icon={ICONS.audio} focused={focused === 'audio'} onClick={() => { setFocused('audio'); applyControl('audio'); }} />
                                <CircleBtn size={42} iconSize={20} icon={ICONS.sub} focused={focused === 'sub'} onClick={() => { setFocused('sub'); applyControl('sub'); }} />
                                {showChaptersBtn && (
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.chapters} focused={focused === 'chapters'} onClick={() => { setFocused('chapters'); applyControl('chapters'); }} />
                                )}
                                {(isSeries || hasNext) && onNext && (
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.next} focused={focused === 'next'} onClick={() => { setFocused('next'); applyControl('next'); }} />
                                )}
                            <VolumeControl muted={state.muted} volume={state.volume} onMute={()=>void player.toggleMute()} onVolume={value=>{void player.setVolume(value);if(state.muted)void player.toggleMute();poke();}}/>
<FullscreenControl onClick={()=>void window.osplayer?.app?.toggleFullscreen()}/>
</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Menü paneli (sağdan kayar — bayi APK) */}
            {menu && (
                <div
                    className="absolute top-0 bottom-0 right-0 px-6 py-8 flex flex-col"
                    style={{ width: MENU_WIDTHS[menu], background: 'rgba(0,0,0,0.95)', zIndex: 61 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center mb-6">
                        <div
                            className="flex items-center justify-center rounded-full cursor-pointer mr-4"
                            style={{ width: 44, height: 44, background: '#333', color: '#fff' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '#333')}
                            onClick={() => { setMenu(null); poke(); }}
                        >
                            <span style={{ width: 24, height: 24 }}>{ICONS.back}</span>
                        </div>
                        <div className="text-white text-[24px] font-normal">{t(MENU_TITLES[menu])}</div>
                    </div>
                    <div className="h-[1px] mb-6 w-full" style={{ background: '#374151' }} />

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-2">
                        {activeMenu.map((it, i) => (
                            <div
                                key={i}
                                onClick={() => { it.onSelect(); setMenu(null); poke(); }}
                                className="flex items-center rounded-md px-4 py-3 cursor-pointer"
                                style={{
                                    background: i === menuIndex ? ACCENT : 'transparent',
                                    color: '#fff',
                                }}
                            >
                                <div
                                    className="mr-3 shrink-0"
                                    style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        border: it.active ? '6px solid #fff' : '2px solid #aaa',
                                    }}
                                />
                                <span className="text-[15px] truncate flex-1">{it.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Otomatik sonraki bölüm (bayi APK AutoNextOverlay — sağ alt köşe, 32dp pad) */}
            {showAutoNext && !menu && (
                <div className="absolute" style={{ zIndex: 70, right: 32, bottom: 32 }}>
                    <div
                        className="flex flex-col items-center"
                        style={{
                            width: 320,
                            background: 'rgba(0,0,0,0.9)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 16,
                            padding: 20,
                        }}
                    >
                        <span style={{ width: 40, height: 40, color: ACCENT }}>{ICONS.next}</span>
                        <div className="text-white text-[16px] font-bold mt-3 text-center">{t('Sonraki bölüme geçiliyor...')}</div>
                        <div className="text-[28px] font-extrabold mt-1" style={{ color: ACCENT }}>{t('{n} saniye', { n: autoNextCountdown })}</div>

                        <div className="flex w-full mt-4" style={{ gap: 12 }}>
                            <div
                                className="flex-1 rounded-lg cursor-pointer py-2.5 text-center text-white text-[13px] font-bold transition-all"
                                style={{ background: autoNextFocus === 'start' ? ACCENT : 'rgba(var(--theme-accent-rgb),0.6)' }}
                                onClick={(e) => { e.stopPropagation(); setShowAutoNext(false); if (onNext) onNext(); }}
                            >
                                {t('ŞİMDİ BAŞLAT')}
                            </div>
                            <div
                                className="flex-1 rounded-lg cursor-pointer py-2.5 text-center text-white text-[13px] font-bold transition-all"
                                style={{ background: autoNextFocus === 'cancel' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }}
                                onClick={(e) => { e.stopPropagation(); setShowAutoNext(false); }}
                            >
                                {t('İPTAL')}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default VodPlayer;
export { VodPlayer };
