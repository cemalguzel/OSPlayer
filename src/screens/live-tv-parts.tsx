import React, { useEffect, useState } from 'react';
import { Focusable } from '../components/common';
import { useT, translate } from '../lib/i18n';
import { useAppStore } from '../store/appStore';
import { decodeEpgText } from '../lib/xtream';
import type { MpvTrack } from '../player/usePlayer';
import type { Channel, EpgListing } from '../types';

/** ===== Canlı TV ekranı yardımcı parçaları (LiveTv.tsx'e özel) ===== */

// ── Görüntü oranı seçenekleri ────────────────────────────────────────────────
export type AspectKey = 'auto' | '16:9' | '4:3' | 'fill';

export const ASPECT_OPTIONS: ReadonlyArray<{ key: AspectKey; label: string; aspect: string }> = [
    { key: 'auto', label: 'Otomatik', aspect: '-1' },
    { key: '16:9', label: '16:9', aspect: '16:9' },
    { key: '4:3', label: '4:3', aspect: '4:3' },
    { key: 'fill', label: 'Doldur', aspect: '-1' },
];

/** mpv parçası için okunur etiket */
export function trackLabel(t: MpvTrack): string {
    if (t.title && t.lang) return `${t.title} (${t.lang.toUpperCase()})`;
    return t.title || (t.lang ? t.lang.toUpperCase() : '') || translate(useAppStore.getState().settings.language, 'Parça {id}', { id: t.id });
}

// ── EPG yardımcıları ─────────────────────────────────────────────────────────
function fmtClock(ts?: string | number): string {
    const n = Number(ts);
    if (!isFinite(n) || n <= 0) return '';
    const d = new Date(n * 1000);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function epgLine(l: EpgListing): string {
    const title = decodeEpgText(l.title).trim();
    const a = fmtClock(l.start_timestamp);
    const b = fmtClock(l.stop_timestamp);
    return a && b ? `${a} - ${b}  ${title}` : title;
}

/** getShortEpg listesinden şimdi/sonra satırlarını üretir */
export function pickNowNext(listings: EpgListing[]): { now: string; next: string } {
    if (!listings.length) return { now: '', next: '' };
    
    // Tekrarlanan saat aralıklarını temizle (kısa olan 'Dizi' gibi jenerik isimleri sil, uzun olanı tut)
    const uniqueListings = listings.reduce((acc, current) => {
        const existingIdx = acc.findIndex(
            (item) => item.start_timestamp === current.start_timestamp && item.stop_timestamp === current.stop_timestamp
        );
        if (existingIdx >= 0) {
            const currentTitle = decodeEpgText(current.title).trim();
            const existingTitle = decodeEpgText(acc[existingIdx].title).trim();
            if (currentTitle.length > existingTitle.length) acc[existingIdx] = current;
        } else {
            acc.push(current);
        }
        return acc;
    }, [] as typeof listings);

    const ts = Date.now() / 1000;
    let i = uniqueListings.findIndex((l) => Number(l.now_playing) === 1);
    if (i < 0)
        i = uniqueListings.findIndex(
            (l) => Number(l.start_timestamp) <= ts && ts < Number(l.stop_timestamp)
        );
    if (i < 0) i = 0;
    const cur = uniqueListings[i];
    const nxt = uniqueListings[i + 1];
    return { now: cur ? epgLine(cur) : '', next: nxt ? epgLine(nxt) : '' };
}

// ── Düzen modu mini butonu ───────────────────────────────────────────────────
function MiniBtn({
    label,
    onClick,
    activeTint,
    title,
}: {
    label: React.ReactNode;
    onClick: () => void;
    activeTint?: boolean;
    title?: string;
}) {
    return (
        <Focusable
            title={title}
            onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                e.stopPropagation();
                onClick();
            }}
            className={`flex items-center justify-center w-6 h-6 rounded-md text-[11px] leading-none cursor-pointer border border-white/15 shrink-0 ${
                activeTint ? 'bg-accent' : 'bg-white/10'
            }`}
        >
            {label}
        </Focusable>
    );
}

// ── Kategori satırı ──────────────────────────────────────────────────────────
interface CategoryRowProps {
    name: string;
    count: number | null;
    active: boolean;
    locked?: boolean;
    hidden?: boolean;
    editMode?: boolean;
    editAction?: string;
    /** Düzen modunda satır içi butonlar gösterilsin mi (FAVORİLER/TÜMÜ → false) */
    editable?: boolean;
    autoFocus?: boolean;
    focusKeyId: string;
    onSelect: () => void;
    onToggleHidden?: () => void;
    onToggleLocked?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function CategoryRow({
    name,
    count,
    active,
    locked,
    hidden,
    editMode,
    editAction,
    editable,
    autoFocus,
    focusKeyId,
    onSelect,
    onToggleHidden,
    onToggleLocked,
    onMoveUp,
    onMoveDown,
    onDragStart,
    onDragOver,
    onDrop,
}: CategoryRowProps) {
    const t = useT();
    const showEdit = !!editMode && !!editable;
    const cls = [
        'cat-row',
        active ? 'cat-row--active' : '',
        hidden && editMode ? 'cat-row--hidden' : '',
        showEdit && editAction === 'cat-move' ? 'cursor-grab' : '',
    ].filter(Boolean).join(' ');

    return (
        <Focusable
            focusKey={focusKeyId}
            autoFocus={autoFocus}
            onClick={onSelect}
            className={cls}
            draggable={showEdit && editAction === 'cat-move'}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {locked && <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>}
            <span className="cat-row__name">{name}</span>
            {count != null && (!showEdit || editAction === 'cat-move') && (
                <span className="cat-row__count">{count}</span>
            )}
            {showEdit && (
                <div className="flex gap-1 shrink-0">
                    {editAction === 'cat-hide' && (
                        <MiniBtn label="👁" title={t('Gizle/Göster')} activeTint={hidden} onClick={onToggleHidden ?? (() => undefined)} />
                    )}
                    {editAction === 'cat-lock' && (
                        <MiniBtn label={<span style={{ filter: locked ? 'none' : 'grayscale(1) opacity(0.5)' }}>🔒</span>} title={t('Kilitle')} activeTint={locked} onClick={onToggleLocked ?? (() => undefined)} />
                    )}
                    {editAction === 'cat-move' && (
                        <>
                            <MiniBtn label="↑" title={t('Yukarı taşı')} onClick={onMoveUp ?? (() => undefined)} />
                            <MiniBtn label="↓" title={t('Aşağı taşı')} onClick={onMoveDown ?? (() => undefined)} />
                            <span className="text-white/40 text-lg px-1 pointer-events-none">↕</span>
                        </>
                    )}
                </div>
            )}
        </Focusable>
    );
}


// ── Kanal kartı (3 sütun grid, ~140x90) ──────────────────────────────────────
interface ChannelCardProps {
    channel: Channel;
    playing: boolean;
    hidden: boolean;
    favorite: boolean;
    locked?: boolean;
    editMode: boolean;
    editAction?: string;
    onClick: () => void;
    onToggleFavorite: () => void;
    onToggleHidden: () => void;
    onToggleLocked?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function ChannelCard({
    channel,
    playing,
    hidden,
    favorite,
    locked,
    editMode,
    editAction,
    onClick,
    onToggleFavorite,
    onToggleHidden,
    onToggleLocked,
    onMoveUp,
    onMoveDown,
    onDragStart,
    onDragOver,
    onDrop,
}: ChannelCardProps) {
    const t = useT();
    const [imgFailed, setImgFailed] = useState(false);
    useEffect(() => setImgFailed(false), [channel.stream_icon]);
    return (
        <Focusable
            focusKey={`ch-${channel.stream_id}`}
            onClick={onClick}
            className={`surface-card relative flex flex-col items-center justify-center gap-1 px-2 py-2 h-[92px] cursor-pointer ${
                hidden && editMode ? 'opacity-40' : ''
            } ${editMode && editAction === 'ch-move' ? 'cursor-grab' : ''}`}
            draggable={editMode && editAction === 'ch-move'}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            style={
                playing
                    ? {
                          borderColor: 'rgba(var(--theme-accent-rgb),0.9)',
                          background: 'rgba(var(--theme-accent-rgb),0.18)',
                          boxShadow: 'inset 0 0 0 2px rgba(var(--theme-accent-rgb),0.9)',
                      }
                    : undefined
            }
        >
            {playing && (
                <span className="absolute top-1 left-1.5 text-[10px] text-accent font-extrabold">▶</span>
            )}
            {!editMode && favorite && (
                <span className="absolute top-0.5 right-1 text-[10px]">⭐</span>
            )}
            <div className="h-10 flex items-center justify-center">
                {channel.stream_icon && !imgFailed ? (
                    <img
                        src={channel.stream_icon}
                        alt=""
                        loading="lazy"
                        className="max-h-10 max-w-[84px] object-contain"
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    <span className="text-2xl">📺</span>
                )}
            </div>
            <div className="w-full flex items-center justify-center gap-1.5 min-w-0">
                {channel.num != null && (
                    <span className="text-[10px] text-white/40 font-mono shrink-0">{channel.num}</span>
                )}
                <span className="text-xs text-white truncate">{channel.name}</span>
            </div>
            {editMode && (
                <div className="absolute top-1 right-1 flex gap-1">
                    {editAction === 'ch-fav' && (
                        <MiniBtn label={favorite ? '⭐' : '☆'} title={t('Favori')} onClick={onToggleFavorite} />
                    )}
                    {editAction === 'ch-hide' && (
                        <MiniBtn label="👁" title={t('Gizle/Göster')} activeTint={hidden} onClick={onToggleHidden} />
                    )}
                    {editAction === 'ch-lock' && (
                        <MiniBtn label="🔒" title={t('Kilitle')} activeTint={locked} onClick={onToggleLocked ?? (() => undefined)} />
                    )}
                    {editAction === 'ch-move' && (
                        <>
                            <MiniBtn label="↑" title={t('Yukarı taşı')} onClick={onMoveUp ?? (() => undefined)} />
                            <MiniBtn label="↓" title={t('Aşağı taşı')} onClick={onMoveDown ?? (() => undefined)} />
                            <span className="text-white/40 text-lg px-1 pointer-events-none">↕</span>
                        </>
                    )}
                </div>
            )}
        </Focusable>
    );
}

// ── Kanal Liste Satırı (APK list görünümü için) ───────────────────────────────
export function ChannelRow({
    channel,
    playing,
    hidden,
    favorite,
    locked,
    editMode,
    editAction,
    onClick,
    onToggleFavorite,
    onToggleHidden,
    onToggleLocked,
    onMoveUp,
    onMoveDown,
    onDragStart,
    onDragOver,
    onDrop,
}: ChannelCardProps) {
    const t = useT();
    const [imgFailed, setImgFailed] = useState(false);
    useEffect(() => setImgFailed(false), [channel.stream_icon]);

    const rowCls = [
        'live-ch-row',
        playing ? 'live-ch-row--playing' : '',
        hidden && editMode ? 'opacity-40' : '',
        editMode && editAction === 'ch-move' ? 'cursor-grab' : '',
    ].filter(Boolean).join(' ');

    return (
        <Focusable
            focusKey={`ch-${channel.stream_id}`}
            onClick={onClick}
            className={rowCls}
            draggable={editMode && editAction === 'ch-move'}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {/* Logo — arka plan yok */}
            <div className="live-ch-row__logo" style={{ background: 'none' }}>
                {channel.stream_icon && !imgFailed ? (
                    <img
                        src={channel.stream_icon}
                        alt=""
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    <span style={{ fontSize: 18 }}>📺</span>
                )}
            </div>

            {/* Kanal adı */}
            <span className="live-ch-row__name">{channel.name}</span>

            {/* Sağ taraf: favori / kilitli */}
            <div className="flex items-center gap-1 shrink-0">
                {!editMode && favorite && (
                    <span style={{ fontSize: 12 }}>⭐</span>
                )}
                {!editMode && locked && (
                    <span style={{ fontSize: 12 }}>🔒</span>
                )}
            </div>            {/* Düzen modu butonları */}
            {editMode && (
                <div className="flex gap-1 shrink-0 ml-1">
                    {editAction === 'ch-fav' && (
                        <MiniBtn label={favorite ? '⭐' : '☆'} title={t('Favori')} onClick={onToggleFavorite} />
                    )}
                    {editAction === 'ch-hide' && (
                        <MiniBtn label="👁" title={t('Gizle/Göster')} activeTint={hidden} onClick={onToggleHidden} />
                    )}
                    {editAction === 'ch-lock' && (
                        <MiniBtn label={<span style={{ filter: locked ? 'none' : 'grayscale(1) opacity(0.5)' }}>🔒</span>} title={t('Kilitle')} activeTint={locked} onClick={onToggleLocked ?? (() => undefined)} />
                    )}
                    {editAction === 'ch-move' && (
                        <>
                            <MiniBtn label="↑" title={t('Yukarı taşı')} onClick={onMoveUp ?? (() => undefined)} />
                            <MiniBtn label="↓" title={t('Aşağı taşı')} onClick={onMoveDown ?? (() => undefined)} />
                            <span className="text-white/40 text-lg px-1 pointer-events-none">↕</span>
                        </>
                    )}
                </div>
            )}
        </Focusable>
    );
}

// ── Video altı ince bilgi bandı ──────────────────────────────────────────────
export function InfoBand({ channel, epgListings }: { channel: Channel | null; epgListings: EpgListing[] }) {
    const t = useT();
    const ts = Date.now() / 1000;

    return (
        <div className="surface-card flex flex-col flex-1 min-h-0 overflow-hidden">
            {channel ? (
                <>
                    <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 shrink-0">
                        <span className="bg-live text-white text-[9px] font-extrabold tracking-widest px-1.5 py-0.5 rounded shrink-0">
                            {t('CANLI')}
                        </span>
                        <span className="text-sm font-bold text-white truncate">{channel.name}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {epgListings.length > 0 ? (() => {
                            let foundNow = false;
                            
                            // Tekrarlanan saat aralıklarını temizle (kısa olan 'Dizi' gibi jenerik isimleri sil, uzun olanı tut)
                            const uniqueListings = epgListings.reduce((acc, current) => {
                                const existingIdx = acc.findIndex(
                                    (item) => item.start_timestamp === current.start_timestamp && item.stop_timestamp === current.stop_timestamp
                                );
                                if (existingIdx >= 0) {
                                    const currentTitle = decodeEpgText(current.title).trim();
                                    const existingTitle = decodeEpgText(acc[existingIdx].title).trim();
                                    if (currentTitle.length > existingTitle.length) acc[existingIdx] = current;
                                } else {
                                    acc.push(current);
                                }
                                return acc;
                            }, [] as typeof epgListings);

                            return uniqueListings.map((l, i) => {
                                const title = decodeEpgText(l.title).trim();
                                const start = fmtClock(l.start_timestamp);
                                const end = fmtClock(l.stop_timestamp);
                                
                                let isNow = false;
                                if (!foundNow && (Number(l.now_playing) === 1 || (Number(l.start_timestamp) <= ts && ts < Number(l.stop_timestamp)))) {
                                    isNow = true;
                                    foundNow = true;
                                }
                                
                                return (
                                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isNow ? 'bg-white/5' : ''}`}>
                                        <div className={`w-28 text-[13px] tracking-wider shrink-0 ${isNow ? 'text-white font-bold' : 'text-white/50'}`}>
                                            {start && end ? `${start} - ${end}` : '--:--'}
                                        </div>
                                        <div className={`flex-1 min-w-0 px-3 text-[14px] truncate ${isNow ? 'text-white font-bold' : 'text-white/80'}`}>
                                            {title}
                                        </div>
                                        <div className="w-20 text-right shrink-0">
                                            {isNow && (
                                                <span className="text-live text-[11px] font-bold tracking-wider">{t('● CANLI')}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            });
                        })() : (
                            <div className="text-xs text-white/40 p-3">{t('Yayın akışı bilgisi yok')}</div>
                        )}
                    </div>
                </>
            ) : (
                <div className="text-xs text-white/40 p-4">{t('Oynatmak için bir kanal seçin')}</div>
            )}
        </div>
    );
}
