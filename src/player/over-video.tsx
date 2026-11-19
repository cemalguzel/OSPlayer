import React from 'react';
import { useT } from '../lib/i18n';
import type { LiveOverlayUi, VodOverlayUi } from '../types';

/**
 * Video PENCERESİ üstü görsel katmanlar (gömülü MPV mimarisi).
 *
 * Aynı bileşenler iki yerde render edilir:
 *  - Ana pencerede: video penceresinin ALTINDA kalır (görünmez) ama fare
 *    tıklamaları video+overlay pencerelerinden geçip buradaki elemanlara
 *    düştüğü için TIKLAMA GEOMETRİSİ olarak görev yapar.
 *  - Overlay penceresinde: pasif görüntü (handler'sız) — kullanıcının gördüğü.
 *
 * Bu yüzden buradaki her şey SERİLEŞTİRİLEBİLİR duruma (LiveOverlayUi /
 * VodOverlayUi) dayanır; handler'lar opsiyoneldir.
 */

export const ACCENT = 'var(--color-accent)'; // MidnightBlue (bayi APK)
export const GOLD = '#FFD700';

export function fmtTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) secs = 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "HH:MM - HH:MM  Başlık" EPG satırını {saat aralığı, başlık, ilerleme%} olarak ayırır */
export function splitEpgLine(line: string): { range: string; title: string; progress: number } {
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

/** Video çözünürlüğü + codec'ten kalite rozeti üretir (bayi APK: "1080P FHD | H264") */
export function qualityLabel(h: number, codec: string): string {
    if (!h) return '';
    const res =
        h >= 2160 ? '4K UHD'
        : h >= 1080 ? '1080P FHD'
        : h >= 720 ? '720P HD'
        : h >= 480 ? '480P SD'
        : `${h}P`;
    return codec ? `${res} | ${codec}` : res;
}

export const ICONS = {
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
    forward: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 13h12.17l-5.59 5.59L12 20l8-8-8-8-1.41 1.41L16.17 11H4v2z"/></svg>,
};

/** Bayi APK CircleControlBtn — odaklıda MidnightBlue dolgu + kenarlık + glow */
export function CircleBtn({
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
    onClick?: () => void;
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
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        >
            <span style={{ width: iconSize, height: iconSize }}>{icon}</span>
            {label && (
                <span style={{ fontSize: 8, lineHeight: '9px', fontWeight: 600 }}>{label}</span>
            )}
        </div>
    );
}

/** Tamponlama göstergesi + hata kartı — her iki modda ortak */
function StatusLayers({ buffering, errorText }: { buffering: boolean; errorText: string | null }) {
    const t = useT();
    return (
        <>
            {buffering && !errorText && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="osp-spinner" style={{ width: 56, height: 56 }} />
                </div>
            )}
            {errorText && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
                    <div className="surface-card px-6 py-4 text-center" style={{ background: 'rgba(var(--theme-surface-rgb),0.9)', maxWidth: 480 }}>
                        <div className="text-error font-bold mb-1">{t('Yayın Hatası')}</div>
                        <div className="text-white/70 text-sm">{errorText}</div>
                    </div>
                </div>
            )}
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// CANLI TV katmanları (bayi APK ChannelInfoBar + yan zap butonları + kanal no)
// ────────────────────────────────────────────────────────────────────────────

export interface LiveLayerHandlers {
    back?: () => void;
    zapPrev?: () => void;
    zapNext?: () => void;
}

export function LiveVideoLayers({ st, on }: { st: LiveOverlayUi; on?: LiveLayerHandlers }) {
    const t = useT();
    if (!st.visible) return null;
    const now = st.epgNow ? splitEpgLine(st.epgNow) : null;
    const next = st.epgNext ? splitEpgLine(st.epgNext) : null;
    return (
        <>
            <StatusLayers buffering={st.buffering} errorText={st.errorText} />

            {st.fullscreen && (
                <>
                    {/* Üst UI — GERİ hap butonu (bayi APK: 40dp pill, ikon 18 + 13sp Bold) */}
                    {st.showInfoBar && (
                        <div className="absolute top-0 left-0" style={{ zIndex: 60, padding: 16 }}>
                            <div
                                className="flex items-center cursor-pointer transition-all hover:bg-accent"
                                style={{
                                    height: 40,
                                    borderRadius: 20,
                                    padding: '0 16px',
                                    gap: 6,
                                    background: 'rgba(0,0,0,0.6)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: '#fff',
                                }}
                                onClick={(e) => { e.stopPropagation(); on?.back?.(); }}
                            >
                                <span style={{ width: 18, height: 18 }}>{ICONS.back}</span>
                                <span style={{ fontSize: 13, fontWeight: 700 }}>{t('GERİ')}</span>
                            </div>
                        </div>
                    )}

                    {/* Kanal numarası girişi */}
                    {st.numInput && (
                        <div className="absolute top-6 right-8 rounded-xl px-5 py-2 text-3xl font-extrabold text-white z-50"
                            style={{ background: 'rgba(var(--theme-surface-rgb),0.8)', border: '1px solid rgba(var(--theme-accent-rgb),0.6)' }}>
                            {st.numInput}
                        </div>
                    )}

                    {/* Yan kanal değiştirme butonları (bayi APK side buttons) */}
                    {st.showInfoBar && (
                        <>
                            <div
                                className="absolute left-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer z-50"
                                style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff' }}
                                onClick={(e) => { e.stopPropagation(); on?.zapPrev?.(); }}
                                title={t('Önceki Kanal')}
                            >
                                <span style={{ width: 28, height: 28 }}>{ICONS.back}</span>
                            </div>
                            <div
                                className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer z-50"
                                style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff' }}
                                onClick={(e) => { e.stopPropagation(); on?.zapNext?.(); }}
                                title={t('Sonraki Kanal')}
                            >
                                <span style={{ width: 28, height: 28 }}>{ICONS.forward}</span>
                            </div>
                        </>
                    )}

                    {/* Info bar (alt) — bayi APK ChannelInfoBar paritesi */}
                    {st.showInfoBar && (
                        <div
                            className="absolute flex items-stretch rounded-xl overflow-hidden"
                            style={{
                                left: 40, right: 40, bottom: 20, height: 130,
                                background: 'rgba(var(--theme-surface-rgb), 0.85)',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        >
                            {/* Sol bölüm: logo + kanal bilgisi */}
                            <div
                                className="flex items-center shrink-0"
                                style={{ width: 280, background: 'rgba(255,255,255,0.03)', padding: '0 16px' }}
                            >
                                <div className="flex items-center justify-center shrink-0" style={{ width: 64, height: 64 }}>
                                    {st.channelIcon ? (
                                        <img
                                            src={st.channelIcon}
                                            alt=""
                                            style={{ width: 56, height: 56, objectFit: 'contain', padding: 4 }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    ) : null}
                                </div>
                                <div className="flex flex-col min-w-0" style={{ marginLeft: 16, gap: 6 }}>
                                    <div className="flex items-center">
                                        <div className="rounded-full shrink-0" style={{ width: 10, height: 10, background: '#EF4444' }} />
                                        <div className="font-bold" style={{ fontSize: 14, letterSpacing: 1, color: 'rgba(255,255,255,0.8)', marginLeft: 8 }}>
                                            {/* Bayi APK: "CANLI YAYIN %1$d" — sadece kanal sırası */}
                                            {t('CANLI YAYIN')}{st.channelIndex >= 0 ? ` ${st.channelIndex + 1}` : ''}
                                        </div>
                                    </div>
                                    <div className="text-white truncate" style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase' }}>
                                        {st.channelName}
                                    </div>
                                    {st.quality && (
                                        <div className="font-bold" style={{ fontSize: 12, color: ACCENT }}>{st.quality}</div>
                                    )}
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
                                            {now.range && (
                                                <span className="text-white font-bold shrink-0" style={{ fontSize: 15, marginLeft: 12 }}>{now.range}</span>
                                            )}
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
                                                {next.range && (
                                                    <span className="text-white font-bold shrink-0" style={{ fontSize: 15, marginLeft: 12 }}>{next.range}</span>
                                                )}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="font-bold" style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                                        {t('EPG verisi bulunamadı')}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// VOD/Dizi katmanları (bayi APK VodInfoBar + menü paneli + auto-next)
// ────────────────────────────────────────────────────────────────────────────

export interface VodLayerHandlers {
    exit?: () => void;
    reset?: () => void;
    /** Buton tıklaması: odakla + uygula (key: FocusKey) */
    control?: (key: string) => void;
    menuSelect?: (index: number) => void;
    menuClose?: () => void;
    autoNextStart?: () => void;
    autoNextCancel?: () => void;
    seekDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
    seekMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
    seekUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function VodVideoLayers({ st, on }: { st: VodOverlayUi; on?: VodLayerHandlers }) {
    const t = useT();
    if (!st.visible) return null;
    const seekFocused = st.seekFocused;
    return (
        <>
            <StatusLayers buffering={st.buffering} errorText={st.errorText} />

            {/* Üst köşe yüzen butonlar: geri (sol) + başa sar (sağ) — bayi APK */}
            {st.controlsVisible && (
                <div className="absolute top-0 left-0 right-0 flex justify-between items-start" style={{ zIndex: 60, padding: 20 }}>
                    <div
                        className="flex items-center justify-center rounded-full cursor-pointer transition-all"
                        style={{
                            width: 48, height: 48,
                            background: 'rgba(0,0,0,0.55)',
                            border: '1.5px solid rgba(255,255,255,0.25)',
                            color: '#fff',
                        }}
                        onClick={(e) => { e.stopPropagation(); on?.exit?.(); }}
                        title={t('Geri')}
                    >
                        <span style={{ width: 24, height: 24 }}>{ICONS.back}</span>
                    </div>
                    <div
                        className="flex items-center justify-center rounded-full cursor-pointer transition-all"
                        style={{
                            width: 48, height: 48,
                            background: 'rgba(0,0,0,0.55)',
                            border: '1.5px solid rgba(255,255,255,0.25)',
                            color: '#fff',
                        }}
                        onClick={(e) => { e.stopPropagation(); on?.reset?.(); }}
                        title={t('Baştan Başlat')}
                    >
                        <span style={{ width: 24, height: 24 }}>{ICONS.reset}</span>
                    </div>
                </div>
            )}

            {/* Alt info bar (bayi APK VodInfoBar) */}
            {st.controlsVisible && (
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
                            <div className="text-[18px] font-semibold text-white truncate" style={{ flex: 1 }}>{st.title}</div>
                            <div className="text-[15px] font-medium whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.75)', marginLeft: 12 }}>
                                {fmtTime(st.displayTimeSecs)} – {fmtTime(st.durationSecs)}
                            </div>
                        </div>

                        {/* Satır 2: seek bar (odaklanabilir, altın sarısı) */}
                        <div
                            className="relative flex items-center"
                            style={{ height: 28, cursor: 'pointer', touchAction: 'none' }}
                            onPointerDown={on?.seekDown}
                            onPointerMove={on?.seekMove}
                            onPointerUp={on?.seekUp}
                        >
                            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.2)' }}>
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${st.progressPercent}%`,
                                        background: GOLD,
                                        transition: 'width 0.1s linear',
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
                                    left: `calc(${st.progressPercent}% - ${seekFocused ? 11 : 9}px)`,
                                    transition: 'left 0.1s linear',
                                    pointerEvents: 'none',
                                }}
                            />
                        </div>

                        {/* Satır 3: kontrol butonları — [oran, hız] | [-10dk -1dk OYNAT +1dk +10dk] | [ses, altyazı, bölümler*, sonraki*] */}
                        <div className="flex items-center" style={{ marginTop: 4 }}>
                            {/* Sol bölge */}
                            <div className="flex items-center" style={{ gap: 8 }}>
                                <CircleBtn size={42} iconSize={20} icon={ICONS.aspect} focused={st.focused === 'aspect'} onClick={() => on?.control?.('aspect')} />
                                <CircleBtn size={42} iconSize={20} icon={ICONS.speed} focused={st.focused === 'speed'} onClick={() => on?.control?.('speed')} />
                            </div>

                            {/* Orta bölge */}
                            <div className="flex-1 flex items-center justify-center" style={{ gap: 10 }}>
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastRewind} label={t('10 dk')} focused={st.focused === 'rw10'} onClick={() => on?.control?.('rw10')} />
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastRewind} label={t('1 dk')} focused={st.focused === 'rw1'} onClick={() => on?.control?.('rw1')} />
                                <CircleBtn size={54} iconSize={28} icon={st.paused ? ICONS.play : ICONS.pause} focused={st.focused === 'play'} onClick={() => on?.control?.('play')} />
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastForward} label={t('1 dk')} focused={st.focused === 'fw1'} onClick={() => on?.control?.('fw1')} />
                                <CircleBtn size={42} iconSize={16} icon={ICONS.fastForward} label={t('10 dk')} focused={st.focused === 'fw10'} onClick={() => on?.control?.('fw10')} />
                            </div>

                            {/* Sağ bölge */}
                            <div className="flex items-center" style={{ gap: 8 }}>
                                <CircleBtn size={42} iconSize={20} icon={ICONS.audio} focused={st.focused === 'audio'} onClick={() => on?.control?.('audio')} />
                                <CircleBtn size={42} iconSize={20} icon={ICONS.sub} focused={st.focused === 'sub'} onClick={() => on?.control?.('sub')} />
                                {st.showChaptersBtn && (
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.chapters} focused={st.focused === 'chapters'} onClick={() => on?.control?.('chapters')} />
                                )}
                                {st.showNextBtn && (
                                    <CircleBtn size={42} iconSize={20} icon={ICONS.next} focused={st.focused === 'next'} onClick={() => on?.control?.('next')} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Menü paneli (sağdan kayar — bayi APK) */}
            {st.menu && (
                <div
                    className="absolute top-0 bottom-0 right-0 px-6 py-8 flex flex-col"
                    style={{ width: st.menu.width, background: 'rgba(0,0,0,0.95)', zIndex: 61 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center mb-6">
                        <div
                            className="flex items-center justify-center rounded-full cursor-pointer mr-4"
                            style={{ width: 44, height: 44, background: '#333', color: '#fff' }}
                            onClick={() => on?.menuClose?.()}
                        >
                            <span style={{ width: 24, height: 24 }}>{ICONS.back}</span>
                        </div>
                        <div className="text-white text-[24px] font-normal">{t(st.menu.title)}</div>
                    </div>
                    <div className="h-[1px] mb-6 w-full" style={{ background: '#374151' }} />

                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-2">
                        {st.menu.items.map((it, i) => (
                            <div
                                key={i}
                                onClick={() => on?.menuSelect?.(i)}
                                className="flex items-center rounded-md px-4 py-3 cursor-pointer"
                                style={{
                                    background: i === st.menu!.index ? ACCENT : 'transparent',
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
                                <span className="text-[15px] truncate flex-1">{t(it.label)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Otomatik sonraki bölüm (bayi APK AutoNextOverlay — sağ alt köşe, 32dp pad) */}
            {st.autoNext && !st.menu && (
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
                        <div className="text-[28px] font-extrabold mt-1" style={{ color: ACCENT }}>{t('{n} saniye', { n: st.autoNext.countdown })}</div>

                        <div className="flex w-full mt-4" style={{ gap: 12 }}>
                            <div
                                className="flex-1 rounded-lg cursor-pointer py-2.5 text-center text-white text-[13px] font-bold transition-all"
                                style={{ background: st.autoNext.focus === 'start' ? ACCENT : 'rgba(var(--theme-accent-rgb),0.6)' }}
                                onClick={(e) => { e.stopPropagation(); on?.autoNextStart?.(); }}
                            >
                                {t('ŞİMDİ BAŞLAT')}
                            </div>
                            <div
                                className="flex-1 rounded-lg cursor-pointer py-2.5 text-center text-white text-[13px] font-bold transition-all"
                                style={{ background: st.autoNext.focus === 'cancel' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }}
                                onClick={(e) => { e.stopPropagation(); on?.autoNextCancel?.(); }}
                            >
                                {t('İPTAL')}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
