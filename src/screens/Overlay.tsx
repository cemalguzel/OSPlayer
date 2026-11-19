import { VolumeControl, FullscreenControl } from '../components/VolumeControl';
import React, { useEffect, useRef, useState } from 'react';
import { isElectron } from '../lib/ipc';
import { useT } from '../lib/i18n';
import type { OverlayState } from '../types';

/**
 * Oynatıcı üstü katman (ayrı şeffaf pencerede çalışır).
 * Tamamen pasiftir: durum mainWindow'dan IPC ile gelir, hiçbir girdi almaz.
 * İçerik: info bar (kanal/EPG), VOD kontrol barı, parça/oran/hız menüleri.
 */

function fmtTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) secs = 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`;
}

function getEpgProgress(epgNowText: string | null | undefined): number {
    if (!epgNowText) return 0;
    const match = epgNowText.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+(.*)$/);
    if (!match) return 0;
    const [_, startStr, stopStr] = match;
    
    const now = new Date();
    const startArr = startStr.split(':').map(Number);
    const stopArr = stopStr.split(':').map(Number);
    
    let startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startArr[0], startArr[1]).getTime();
    let stopMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), stopArr[0], stopArr[1]).getTime();
    
    if (stopMs <= startMs) {
        if (now.getHours() < 12) {
            startMs -= 24 * 3600 * 1000;
        } else {
            stopMs += 24 * 3600 * 1000;
        }
    }
    
    const curMs = now.getTime();
    if (curMs < startMs) return 0;
    if (curMs > stopMs) return 100;
    return ((curMs - startMs) / (stopMs - startMs)) * 100;
}

const ACCENT = 'var(--color-accent)';
const GOLD = '#FFD700';

/** "HH:MM - HH:MM  Başlık" → {range, title, progress} (ornek LiveTv paritesi) */
function splitEpgLine(line: string): { range: string; title: string; progress: number } {
    const m = line.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+(.*)$/);
    if (!m) return { range: '', title: line, progress: 0 };
    const [, startStr, stopStr, title] = m;
    const now = new Date();
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = stopStr.split(':').map(Number);
    let startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm).getTime();
    let stopMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eh, em).getTime();
    if (stopMs <= startMs) {
        if (now.getHours() < 12) startMs -= 24 * 3600 * 1000;
        else stopMs += 24 * 3600 * 1000;
    }
    const cur = now.getTime();
    const progress = cur <= startMs ? 0 : cur >= stopMs ? 100 : ((cur - startMs) / (stopMs - startMs)) * 100;
    return { range: `${startStr} - ${stopStr}`, title, progress };
}

const ICONS: Record<string, React.ReactNode> = {
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

/** Ornek VodPlayer CircleControlBtn paritesi */
function CircleBtn({ size, iconSize, icon, label, focused, onClick }: {
    size: number; iconSize: number; icon: React.ReactNode; label?: string; focused: boolean; onClick: () => void;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center rounded-full cursor-pointer transition-all shrink-0"
            style={{
                width: size, height: size,
                background: focused ? 'rgba(var(--theme-accent-rgb),0.3)' : 'rgba(255,255,255,0.08)',
                border: focused ? `2px solid ${ACCENT}` : '2px solid rgba(255,255,255,0.1)',
                boxShadow: focused ? `0 0 ${Math.round(size * 0.8)}px rgba(var(--theme-accent-rgb),0.4)` : 'none',
                color: focused ? '#fff' : 'rgba(255,255,255,0.7)',
            }}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
        >
            <span style={{ width: iconSize, height: iconSize }}>{icon}</span>
            {label && <span style={{ fontSize: 8, lineHeight: '9px', fontWeight: 600 }}>{label}</span>}
        </div>
    );
}

const EMPTY: OverlayState = {
    visible: false,
    mode: 'live',
    title: '',
    paused: false,
    buffering: false,
    positionSecs: 0,
    durationSecs: 0,
    showInfoBar: false,
    showControls: false,
    menu: null,
};

export default function OverlayScreen() {
    const t = useT();
    const [st, setSt] = useState<OverlayState>(EMPTY);
    const lastPoke = useRef(0);
    // Seek bar tutup-sürükleme önizlemesi (MPV): sürüklerken süre + çubuk anlık
    // takip etsin; gerçek seek komutu bırakınca gönderilir.
    const [dragRatio, setDragRatio] = useState<number | null>(null);
    const dragRatioRef = useRef<number | null>(null);
    dragRatioRef.current = dragRatio;
    // Bırakıldıktan sonra oynatıcı gerçek konuma ulaşana kadar hedef oranı tut.
    // Yoksa çubuk önce eski konuma geri kaçar, seek tamamlanınca yine ileri atlar.
    const [pendingRatio, setPendingRatio] = useState<number | null>(null);

    const handleMouseMove = () => {
        const now = Date.now();
        if (now - lastPoke.current > 500) {
            lastPoke.current = now;
            // player:poke → mainWindow'a yönlendirilir
            window.osplayer?.player?.poke();
        }
    };

    // Overlay'deki tıklamayı mainWindow oynatıcısına komut olarak gönder
    const cmd = (payload: unknown) => {
        window.osplayer?.overlay?.command(payload);
    };

    useEffect(() => {
        document.body.classList.add('overlay-mode');
        document.documentElement.classList.add('overlay-mode');
        if (!isElectron) return;
        const off = window.osplayer.overlay.onState((s) => setSt(s as OverlayState));
        return () => {
            off();
            document.body.classList.remove('overlay-mode');
            document.documentElement.classList.remove('overlay-mode');
        };
    }, []);

    // Seek bar konumu — aktif sürükleme ya da bekleyen seek varsa önizleme oranını,
    // yoksa gerçek pozisyonu kullan
    const liveRatio = st.durationSecs > 0 ? st.positionSecs / st.durationSecs : 0;
    const overrideRatio = dragRatio !== null ? dragRatio : pendingRatio;
    const seekRatio = overrideRatio !== null ? overrideRatio : liveRatio;
    const seekPct = Math.min(100, Math.max(0, seekRatio * 100));
    const seekPos = overrideRatio !== null ? overrideRatio * st.durationSecs : st.positionSecs;
    const seekFocused = st.focusedControl === 'seek' || overrideRatio !== null;

    // Oynatıcı bekleyen seek hedefine (~1.5sn) ulaşınca önizlemeyi bırak → gerçek
    // pozisyona pürüzsüz geçiş, geri kaçma olmadan.
    useEffect(() => {
        if (pendingRatio === null || st.durationSecs <= 0) return;
        const target = pendingRatio * st.durationSecs;
        if (Math.abs(st.positionSecs - target) < 1.5) setPendingRatio(null);
    }, [st.positionSecs, st.durationSecs, pendingRatio]);

    // Güvenlik: oynatıcı hedefe tam oturmazsa önizlemeyi en geç 4sn sonra bırak.
    useEffect(() => {
        if (pendingRatio === null) return;
        const id = setTimeout(() => setPendingRatio(null), 4000);
        return () => clearTimeout(id);
    }, [pendingRatio]);

    const ratioFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    };
    const onSeekDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (st.durationSecs <= 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPendingRatio(null);
        setDragRatio(ratioFromEvent(e));
    };
    const onSeekMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRatioRef.current === null || st.durationSecs <= 0) return;
        setDragRatio(ratioFromEvent(e));
        window.osplayer?.player?.poke();
    };
    const onSeekUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = dragRatioRef.current;
        if (r !== null && st.durationSecs > 0) {
            cmd({ type: 'seek', ratio: r });
            // Oynatıcı yeni konuma ulaşana kadar çubuğu hedefte tut (geri kaçmayı önler).
            setPendingRatio(r);
        }
        setDragRatio(null);
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* yoksay */ }
    };

    if (!st.visible) return <div className="w-full h-full" />;

    return (
        <div 
            className="relative w-full h-full overflow-hidden font-sans"
            onMouseMove={handleMouseMove}
            onClick={() => {
                // Menü açıkken boş alana tıklama menüyü kapatır; aksi halde
                // kontrolleri göster (ornek paritesi). Tam ekran çift tıkla.
                if (st.menu) { cmd({ type: 'menuClose' }); return; }
                window.osplayer?.player?.poke();
            }}
            onDoubleClick={() => { void window.osplayer?.app?.toggleFullscreen(); }}
        >
            {/* Top Bar: Geri & Tam Ekran (yalnızca CANLI; VOD'un kendi üst butonları var) */}
            {st.showInfoBar && st.mode === 'live' && (
                <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start pointer-events-none" style={{ zIndex: 100 }}>
                    {/* Geri Butonu */}
                    <div
                        className="flex items-center cursor-pointer transition-all hover:bg-accent pointer-events-auto"
                        style={{
                            height: 40,
                            borderRadius: 20,
                            padding: '0 16px',
                            gap: 6,
                            background: 'rgba(0,0,0,0.6)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                        }}
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            // player:exit-fullscreen → mainWindow'a yönlendirilir
                            window.osplayer?.player?.exitFullscreen();
                        }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{t('GERİ')}</span>
                    </div>

                    {/* Tam Ekran Butonu */}
                    <div
                        className="flex items-center gap-2 cursor-pointer rounded-full px-4 py-2 pointer-events-auto"
                        style={{
                            background: 'rgba(0,0,0,0.6)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                        }}
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            void window.osplayer?.app?.toggleFullscreen();
                        }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Tam Ekran')}</span>
                    </div>
                </div>
            )}

            {/* Tamponlama göstergesi */}
            {st.buffering && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="osp-spinner" style={{ width: 56, height: 56 }} />
                </div>
            )}

            {/* Hata */}
            {st.errorText && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="surface-card px-8 py-5 text-center" style={{ background: 'rgba(var(--theme-surface-rgb),0.9)' }}>
                        <div className="text-error font-bold mb-1">{t('Yayın Hatası')}</div>
                        <div className="text-white/70 text-sm">{st.errorText}</div>
                    </div>
                </div>
            )}

            {/* Kanal numarası girişi (canlı) */}
            {st.channelNumberInput && (
                <div className="absolute top-6 right-8 rounded-xl px-5 py-2 text-3xl font-extrabold text-white"
                    style={{ background: 'rgba(var(--theme-surface-rgb),0.8)', border: '1px solid rgba(var(--theme-accent-rgb),0.6)' }}>
                    {st.channelNumberInput}
                </div>
            )}

            {/* Canlı: yan kanal değiştirme butonları (fare ile zap) */}
            {st.showInfoBar && st.mode === 'live' && (
                <>
                    <div
                        className="absolute left-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer"
                        style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', zIndex: 90 }}
                        onClick={(e) => { e.stopPropagation(); cmd({ type: 'zap', dir: -1 }); }}
                        title={t('Önceki Kanal')}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                    </div>
                    <div
                        className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer"
                        style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', zIndex: 90 }}
                        onClick={(e) => { e.stopPropagation(); cmd({ type: 'zap', dir: 1 }); }}
                        title={t('Sonraki Kanal')}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}><path d="M4 13h12.17l-5.59 5.59L12 20l8-8-8-8-1.41 1.41L16.17 11H4v2z"/></svg>
                    </div>
                </>
            )}

            {/* Canlı TV Info bar (ornek ChannelInfoBar paritesi) */}
            {st.showInfoBar && st.mode === 'live' && (() => {
                const now = st.epgNow ? splitEpgLine(st.epgNow) : null;
                const next = st.epgNext ? splitEpgLine(st.epgNext) : null;
                return (
                    <div
                        className="absolute flex items-stretch rounded-xl overflow-hidden"
                        style={{ left: 40, right: 40, bottom: 20, height: 130, background: 'rgba(var(--theme-surface-rgb), 0.85)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        {/* Sol bölüm: logo + kanal bilgisi */}
                        <div className="flex items-center shrink-0" style={{ width: '32%', minWidth: 250, position:'relative', alignItems:'center', background: 'rgba(255,255,255,0.03)', padding: '0 16px' }}>
                            <div className="flex items-center justify-center shrink-0" style={{ width: 64, height: 64 }}>
                                {st.logo ? (
                                    <img src={st.logo} alt="" style={{ width: 56, height: 56, objectFit: 'contain', padding: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                ) : null}
                            </div>
                            <div className="flex flex-col min-w-0" style={{ marginLeft: 16, gap: 6 }}>
                                <div className="flex items-center">
                                    <div className="rounded-full shrink-0" style={{ width: 10, height: 10, background: '#EF4444' }} />
                                    <div className="font-bold" style={{ fontSize: 14, letterSpacing: 1, color: 'rgba(255,255,255,0.8)', marginLeft: 8 }}>
                                        {t('CANLI YAYIN')}{typeof st.channelIndex === 'number' && st.channelIndex >= 0 ? ` ${st.channelIndex + 1}` : ''}
                                    </div>
                                </div>
                                <div className="text-white truncate" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.01em' }}>{st.title}</div>
                                {st.quality && <div className="font-bold" style={{ fontSize: 12, color: 'var(--color-accent)' }}>{st.quality}</div>}
                            </div>

                        </div>


                        {/* Ayraç */}
                        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />

                        {/* Sağ bölüm: EPG şimdi/sonraki */}
                        <div className="flex-1 flex flex-col justify-center min-w-0" style={{ padding: '0 24px' }}>
                            {now ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center min-w-0" style={{ gap: 8 }}>
                                            <span className="text-white font-bold shrink-0" style={{ fontSize: 15 }}>{t('ŞİMDİ:')}</span>
                                            <span className="text-white font-bold truncate" style={{ fontSize: 15 }}>{now.title}</span>
                                        </div>
                                        {now.range && <span className="text-white font-bold shrink-0" style={{ fontSize: 15, marginLeft: 12 }}>{now.range}</span>}
                                    </div>
                                    <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.3)', marginTop: 10 }}>
                                        <div className="h-full rounded-full" style={{ width: `${now.progress}%`, background: GOLD }} />
                                    </div>
                                    {next && (
                                        <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                                            <div className="flex items-center min-w-0" style={{ gap: 8 }}>
                                                <span className="text-white font-bold shrink-0" style={{ fontSize: 15 }}>{t('SONRAKİ:')}</span>
                                                <span className="text-white font-bold truncate" style={{ fontSize: 15 }}>{next.title}</span>
                                            </div>
                                            {next.range && <span className="text-white font-bold shrink-0" style={{ fontSize: 15, marginLeft: 12 }}>{next.range}</span>}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="font-bold" style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{t('EPG verisi bulunamadı')}</div>
                            )}
                        </div>
<div className="infobar-right-controls" style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:24,padding:'0 22px',flexShrink:0,borderLeft:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.03)'}}><VolumeControl muted={st.muted} volume={st.volume ?? 100} onMute={()=>cmd({type:'control',control:'mute'})} onVolume={value=>cmd({type:'volume',value})}/><FullscreenControl onClick={()=>void window.osplayer?.app?.toggleFullscreen()}/></div>
                    </div>
                );
            })()}

            {/* VOD üst köşe butonları: geri (sol) + başa sar + tam ekran (sağ) — ornek paritesi.
                Menü açıkken gizle: sağdaki menü paneliyle üst üste binmesin (menünün kendi geri butonu var). */}
            {st.showInfoBar && st.mode === 'vod' && !st.menu && (
                <div className="absolute top-0 left-0 right-0 flex justify-between items-start" style={{ zIndex: 60, padding: 20 }}>
                    <div
                        className="flex items-center justify-center rounded-full cursor-pointer transition-all hover:bg-accent"
                        style={{ width: 48, height: 48, background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.25)', color: '#fff' }}
                        onClick={(e) => { e.stopPropagation(); cmd({ type: 'control', control: 'back' }); }}
                        title={t('Geri')}
                    >
                        <span style={{ width: 24, height: 24 }}>{ICONS.back}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div
                            className="flex items-center justify-center rounded-full cursor-pointer transition-all hover:bg-accent"
                            style={{ width: 48, height: 48, background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.25)', color: '#fff' }}
                            onClick={(e) => { e.stopPropagation(); cmd({ type: 'control', control: 'reset' }); }}
                            title={t('Baştan Başlat')}
                        >
                            <span style={{ width: 24, height: 24 }}>{ICONS.reset}</span>
                        </div>
                        <div
                            className="flex items-center gap-2 rounded-full cursor-pointer transition-all px-4 hover:bg-accent"
                            style={{ height: 48, background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.25)', color: '#fff' }}
                            onClick={(e) => { e.stopPropagation(); void window.osplayer?.app?.toggleFullscreen(); }}
                            title={t('Tam Ekran')}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('TAM EKRAN')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* VOD alt info bar (ornek VodInfoBar paritesi) */}
            {st.showInfoBar && st.mode === 'vod' && (
                <div
                    className="absolute left-0 right-0 bottom-0"
                    style={{ padding: '40px 20px 10px', background: 'linear-gradient(to top, rgba(var(--theme-surface-rgb),0.94) 0%, rgba(var(--theme-surface-rgb),0.8) 50%, transparent 100%)' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="rounded-[14px]" style={{ background: 'rgba(var(--theme-surface-rgb), 0.85)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 16px' }}>
                        {/* Satır 1: başlık + süre */}
                        <div className="flex justify-between items-center">
                            <div className="text-[18px] font-semibold text-white truncate" style={{ flex: 1 }}>{st.title}</div>
                            <div className="text-[15px] font-medium whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.75)', marginLeft: 12 }}>
                                {fmtTime(seekPos)} – {fmtTime(st.durationSecs)}
                            </div>
                        </div>

                        {/* Satır 2: seek bar (altın sarısı, tutup-sürüklenebilir) */}
                        <div
                            className="relative flex items-center"
                            style={{ height: 28, cursor: 'pointer', touchAction: 'none' }}
                            onPointerDown={onSeekDown}
                            onPointerMove={onSeekMove}
                            onPointerUp={onSeekUp}
                        >
                            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.2)' }}>
                                <div
                                    className="h-full rounded-full pointer-events-none"
                                    style={{
                                        width: `${seekPct}%`,
                                        background: GOLD,
                                        transition: overrideRatio !== null ? 'none' : 'width 0.1s linear',
                                    }}
                                />
                            </div>
                            <div
                                className="absolute rounded-full pointer-events-none"
                                style={{
                                    width: seekFocused ? 22 : 18,
                                    height: seekFocused ? 22 : 18,
                                    background: GOLD,
                                    boxShadow: seekFocused ? '0 0 14px rgba(255,215,0,0.7)' : 'none',
                                    left: `calc(${seekPct}% - ${seekFocused ? 11 : 9}px)`,
                                    transition: overrideRatio !== null ? 'none' : 'left 0.1s linear',
                                }}
                            />
                        </div>

                        {/* Satır 3: kontrol butonları */}
                        {st.showControls && (
                            <div className="player-control-row flex items-center" style={{ marginTop: 4 }}>
                                {/* Sol: oran + hız */}
                                <div className="flex items-center" style={{ gap: 8 }}>
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.aspect} focused={st.focusedControl === 'aspect'} onClick={() => cmd({ type: 'control', control: 'aspect' })} />
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.speed} focused={st.focusedControl === 'speed'} onClick={() => cmd({ type: 'control', control: 'speed' })} />

                                </div>

                                {/* Orta: -10dk -1dk OYNAT +1dk +10dk */}
                                <div className="flex-1 flex items-center justify-center" style={{ gap: 10 }}>
                                    <CircleBtn size={42} iconSize={16} icon={ICONS.fastRewind} label={t('10 dk')} focused={st.focusedControl === 'rw10'} onClick={() => cmd({ type: 'control', control: 'rw10' })} />
                                    <CircleBtn size={42} iconSize={16} icon={ICONS.fastRewind} label={t('1 dk')} focused={st.focusedControl === 'rw1'} onClick={() => cmd({ type: 'control', control: 'rw1' })} />
                                    <CircleBtn size={54} iconSize={28} icon={st.paused ? ICONS.play : ICONS.pause} focused={st.focusedControl === 'play'} onClick={() => cmd({ type: 'control', control: 'play' })} />
                                    <CircleBtn size={42} iconSize={16} icon={ICONS.fastForward} label={t('1 dk')} focused={st.focusedControl === 'fw1'} onClick={() => cmd({ type: 'control', control: 'fw1' })} />
                                    <CircleBtn size={42} iconSize={16} icon={ICONS.fastForward} label={t('10 dk')} focused={st.focusedControl === 'fw10'} onClick={() => cmd({ type: 'control', control: 'fw10' })} />
                                </div>

                                {/* Sağ: ses + altyazı + bölümler* + sonraki* */}
                                <div className="flex items-center" style={{ gap: 8 }}>
                                    
<CircleBtn size={42} iconSize={20} icon={ICONS.audio} focused={st.focusedControl === 'audio'} onClick={() => cmd({ type: 'control', control: 'audio' })} />
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.sub} focused={st.focusedControl === 'sub'} onClick={() => cmd({ type: 'control', control: 'sub' })} />
                                    {st.hasChapters && (
                                        <CircleBtn size={42} iconSize={20} icon={ICONS.chapters} focused={st.focusedControl === 'chapters'} onClick={() => cmd({ type: 'control', control: 'chapters' })} />
                                    )}
                                    {st.hasNext && (
                                        <CircleBtn size={42} iconSize={20} icon={ICONS.next} focused={st.focusedControl === 'next'} onClick={() => cmd({ type: 'control', control: 'next' })} />
                                    )}
                                <VolumeControl muted={st.muted} volume={st.volume ?? 100} onMute={()=>cmd({type:'control',control:'mute'})} onVolume={value=>cmd({type:'volume',value})}/>
<FullscreenControl onClick={()=>void window.osplayer?.app?.toggleFullscreen()}/>
</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Menü (ses/altyazı/oran/hız) — sağ panel */}
            {st.menu && (
                <div
                    className="absolute top-0 bottom-0 right-0 w-80 px-6 py-8 overflow-y-auto"
                    style={{ background: 'linear-gradient(to left, rgba(var(--theme-surface-rgb),0.95), rgba(var(--theme-surface-rgb),0.75))' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Başlık + geri/kapat butonu (ornek paritesi) */}
                    <div className="flex items-center mb-5">
                        <div
                            className="flex items-center justify-center rounded-full cursor-pointer mr-3 shrink-0"
                            style={{ width: 40, height: 40, background: '#333', color: '#fff' }}
                            onClick={(e) => { e.stopPropagation(); cmd({ type: 'menuClose' }); }}
                            title={t('Geri')}
                        >
                            <span style={{ width: 22, height: 22 }}>{ICONS.back}</span>
                        </div>
                        <div className="text-white font-extrabold tracking-widest text-base">{t(st.menu.title)}</div>
                    </div>
                    <div className="space-y-1.5">
                        {st.menu.items.map((it, i) => (
                            <div
                                key={i}
                                className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); cmd({ type: 'menuSelect', index: i }); }}
                                style={{
                                    background:
                                        i === st.menu!.focusedIndex ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                                    border:
                                        i === st.menu!.focusedIndex
                                            ? '1px solid #fff'
                                            : '1px solid rgba(255,255,255,0.08)',
                                    color: '#fff',
                                }}
                            >
                                <span className="truncate">{t(it.label)}</span>
                                {it.active && <span className="text-success font-bold ml-2">✓</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
