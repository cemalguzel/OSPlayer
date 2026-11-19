import { VolumeControl, FullscreenControl } from '../components/VolumeControl';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useAppStore, useCurrentRoute } from '../store/appStore';
import { useContentStore } from '../store/contentStore';
import { useHtmlPlayer } from '../player/useHtmlPlayer';
import { usePlayer, sendOverlay } from '../player/usePlayer';
import { TopBar, GlassButton, PinDialog, EmptyState, Spinner } from '../components/common';
import { focusFirst, focusKey as focusByKey } from '../nav/spatial';
import type { Channel, EpgListing } from '../types';
import { CategoryRow, ChannelRow, InfoBand, pickNowNext } from './live-tv-parts';
import { useT } from '../lib/i18n';

/**
 * CANLI TV ekranı — APK LiveTvScreen.kt karşılığı.
 *
 * Gömülü MPV mimarisi: video ayrı native pencerede oynar; bu ekran sadece
 * SİYAH bir placeholder div (regionRef) bırakır ve usePlayer bu div'in
 * koordinatlarını ana sürece bildirir. Video üzeri arayüz (info bar, menüler,
 * kanal numarası, hata) overlay penceresinde çizilir — buradan sendOverlay
 * ile OverlayState yayınlanır.
 */

type PinTarget = { type: 'edit' } | { type: 'cat'; id: string };
type SortMode = 'default' | 'az' | 'za';
type CatId = 'all' | 'fav' | 'recent' | string;
type EditAction = 'cat-move' | 'cat-hide' | 'cat-lock' | 'ch-move' | 'ch-hide' | 'ch-lock' | 'ch-fav';

const DIGIT_COMMIT_MS = 2000;
// Bayi APK: canlı info bar 7 sn sonra otomatik gizlenir
const BAR_HIDE_MS = 7000;

/** "HH:MM - HH:MM  Başlık" EPG satırını {saat aralığı, başlık, ilerleme%} olarak ayırır */
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

/** Video çözünürlüğü + codec'ten kalite rozeti üretir (bayi APK: "1080P FHD | H264") */
function qualityLabel(h: number, codec: string): string {
    if (!h) return '';
    const res =
        h >= 2160 ? '4K UHD'
        : h >= 1080 ? '1080P FHD'
        : h >= 720 ? '720P HD'
        : h >= 480 ? '480P SD'
        : `${h}P`;
    return codec ? `${res} | ${codec}` : res;
}

export default function LiveTvScreen() {
    const t = useT();
    const route = useCurrentRoute();
    const back = useAppStore((s) => s.back);
    const push = useAppStore((s) => s.push);

    // İçerik durumu
    const liveCategories = useContentStore((s) => s.liveCategories);
    const channelsByCat = useContentStore((s) => s.channelsByCat);
    const allChannels = useContentStore((s) => s.allChannels);
    const favorites = useContentStore((s) => s.favorites);
    const hiddenCategories = useContentStore((s) => s.hiddenCategories);
    const hiddenItems = useContentStore((s) => s.hiddenItems);
    const lockedCategories = useContentStore((s) => s.lockedCategories);
    const lockedItems = useContentStore((s) => s.lockedItems);
    const unlockedSession = useContentStore((s) => s.unlockedSession);

    // Ekran durumu
    const [selectedCat, setSelectedCat] = useState<CatId>('all');
    const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [showInfoBar, setShowInfoBar] = useState(false);
    const [numInput, setNumInput] = useState('');
    const [epgNow, setEpgNow] = useState('');
    const [epgNext, setEpgNext] = useState('');
    const [epgListings, setEpgListings] = useState<EpgListing[]>([]);
    const [sortMode, setSortMode] = useState<SortMode>('default');
    const [searchQuery, setSearchQuery] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [editAction, setEditAction] = useState<EditAction>('cat-hide');
    // PIN / Kilit yönetimi
    const [pinTarget, setPinTarget] = useState<
        { type: 'cat'; id: string } | { type: 'edit' } | { type: 'channel'; ch: Channel } | null
    >(null);
    const [pinError, setPinError] = useState<string | null>(null);
    const [catsLoading, setCatsLoading] = useState(true);
    const [loadingChannels, setLoadingChannels] = useState(true);
    const [toast, setToast] = useState<string | null>(null);

    // DND State
    const [draggedCat, setDraggedCat] = useState<string | null>(null);
    const [draggedCh, setDraggedCh] = useState<string | null>(null);

    // Oynatıcı — HTML video element referansı
    const videoPlayerSetting = useAppStore(s => s.settings.videoPlayer) || 'html5';
    const recentlyWatchedLimit = useAppStore(s => s.settings.recentlyWatchedLimit);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const htmlApi = useHtmlPlayer(videoRef, videoPlayerSetting === 'html5');
    const mpvApi = usePlayer(containerRef, videoPlayerSetting === 'mpv');

    const player = videoPlayerSetting === 'html5' ? htmlApi : mpvApi;
    useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==='m' && !['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName)){e.preventDefault();void player.toggleMute();}};window.addEventListener('keydown',h);return ()=>window.removeEventListener('keydown',h);},[player.toggleMute]);
    const stopRef = useRef(player.stop);
    stopRef.current = player.stop;

    // Zamanlayıcılar
    const barTimer = useRef<number | null>(null);
    const digitTimer = useRef<number | null>(null);
    const toastTimer = useRef<number | null>(null);
    const numRef = useRef('');
    const epgSeq = useRef(0);

    // ── Türetilmiş listeler ──────────────────────────────────────────────────
    const visibleCategories = useMemo(
        () =>
            editMode
                ? liveCategories
                : liveCategories.filter((c) => !hiddenCategories[`live:${c.category_id}`]),
        [liveCategories, hiddenCategories, editMode]
    );

    const rawChannels = useMemo<Channel[]>(() => {
        if (selectedCat === 'fav')
            return (allChannels ?? []).filter((c) => favorites[`live:${c.stream_id}`]);
        if (selectedCat === 'recent') {
            // Son izlenenler: contentStore.recent'ten live olanlar, sırası korunur
            const limit = useAppStore.getState().settings.recentlyWatchedLimit;
            const recentList = useContentStore.getState().recent
                .filter((r) => r.kind === 'live')
                .slice(0, limit);
            const idSet = new Map(recentList.map((r, i) => [r.id, i]));
            return (allChannels ?? [])
                .filter((c) => idSet.has(String(c.stream_id)))
                .sort((a, b) => (idSet.get(String(a.stream_id)) ?? 99) - (idSet.get(String(b.stream_id)) ?? 99));
        }
        const key = selectedCat === 'all' ? '__all__' : selectedCat;
        return channelsByCat[key] ?? [];
    }, [selectedCat, allChannels, channelsByCat, favorites, recentlyWatchedLimit]);

    const itemOrder = useContentStore((s) => s.itemOrder);

    const displayChannels = useMemo(() => {
        const base = editMode
            ? rawChannels
            : rawChannels.filter((c) => !hiddenItems[`live:${c.stream_id}`]);

        let filtered = base;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = base.filter(c => c.name.toLowerCase().includes(q));
        }

        const sorted = [...filtered];
        const orderKey = `live:${selectedCat}`;
        const customOrder = itemOrder[orderKey];

        if (customOrder && customOrder.length > 0 && sortMode === 'default') {
            sorted.sort((a, b) => {
                const ia = customOrder.indexOf(String(a.stream_id));
                const ib = customOrder.indexOf(String(b.stream_id));
                return (ia < 0 ? 99999 : ia) - (ib < 0 ? 99999 : ib);
            });
        } else {
            if (sortMode === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
            else if (sortMode === 'za') sorted.sort((a, b) => b.name.localeCompare(a.name, 'tr'));
            else
                sorted.sort(
                    (a, b) =>
                        (a.num ?? Number.MAX_SAFE_INTEGER) - (b.num ?? Number.MAX_SAFE_INTEGER)
                );
        }
        return sorted;
    }, [rawChannels, editMode, hiddenItems, sortMode, itemOrder, selectedCat, searchQuery]);

    const countByCat = useMemo(() => {
        if (!allChannels) return null;
        const m = new Map<string, number>();
        for (const c of allChannels)
            if (c.category_id) m.set(c.category_id, (m.get(c.category_id) ?? 0) + 1);
        return m;
    }, [allChannels]);

    const favCount = useMemo(
        () =>
            allChannels ? allChannels.filter((c) => favorites[`live:${c.stream_id}`]).length : null,
        [allChannels, favorites]
    );

    // ── Güncel durum aynası (keydown/app-back kapanışları için) ──────────────
    const live = useRef({
        displayChannels,
        playingChannel,
        showInfoBar,
        fullscreen,
        editMode,
        pinOpen: pinTarget !== null,
    });
    live.current = {
        displayChannels,
        playingChannel,
        showInfoBar,
        fullscreen,
        editMode,
        pinOpen: pinTarget !== null,
    };

    useEffect(() => {
        if (videoPlayerSetting === 'html5' || !fullscreen) {
            sendOverlay({ visible: false });
            return;
        }

        const chIdx = playingChannel
            ? displayChannels.findIndex((c) => c.stream_id === playingChannel.stream_id)
            : -1;
        sendOverlay({
            visible: true,
            mode: 'live',
            title: playingChannel?.name || '',
            subtitle: '',
            muted: player.state.muted, volume: player.state.volume,
            paused: player.state.paused,
            buffering: player.state.buffering,
            showInfoBar: showInfoBar,
            epgNow: epgNow,
            epgNext: epgNext,
            errorText: player.state.error,
            channelNumberInput: numInput || undefined,
            logo: playingChannel?.stream_icon || undefined,
            quality: qualityLabel(videoRef.current?.videoHeight ?? 0, player.state.videoCodec ?? ''),
            channelIndex: chIdx,
        });
    }, [videoPlayerSetting, fullscreen, playingChannel, showInfoBar, epgNow, epgNext, player.state, numInput, displayChannels]);

    useEffect(()=>{window.osplayer?.advertising.context({screen:'live',fullscreen:fullscreen && !!playingChannel && !player.state.error,controls:showInfoBar});return ()=>window.osplayer?.advertising.context({screen:'none',fullscreen:false,controls:true});},[fullscreen,showInfoBar,playingChannel,player.state.error]);

    // ── Yardımcılar ──────────────────────────────────────────────────────────
    // Bayi APK paritesi: canlı info bar gösterildikten 7 sn sonra otomatik gizlenir.
    const showBar = useCallback(() => {
        setShowInfoBar(true);
        if (barTimer.current !== null) window.clearTimeout(barTimer.current);
        barTimer.current = window.setTimeout(() => setShowInfoBar(false), BAR_HIDE_MS);
    }, []);

    const hideBar = useCallback(() => {
        if (barTimer.current !== null) window.clearTimeout(barTimer.current);
        barTimer.current = null;
        setShowInfoBar(false);
    }, []);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 2500);
    }, []);

    const playChannel = useCallback(
        (ch: Channel) => {
            const cs = useContentStore.getState();
            if (cs.isItemLocked('live', ch.stream_id)) {
                setPinError(null);
                setPinTarget({ type: 'channel', ch });
                return;
            }

            setPlayingChannel(ch);
            setEpgNow('');
            setEpgNext('');
            setEpgListings([]);
            const client = useAppStore.getState().client;
            if (!client) return;
            
            void player.load(client.liveUrl(ch.stream_id, 'm3u8'));
            useContentStore.getState().addRecent('live', String(ch.stream_id), ch.name, ch.stream_icon);
            const seq = ++epgSeq.current;
            client
                .getShortEpg(ch.stream_id, 15)
                .then((listings) => {
                    if (seq !== epgSeq.current) return;
                    const { now, next } = pickNowNext(listings);
                    setEpgNow(now);
                    setEpgNext(next);
                    setEpgListings(listings);
                })
                .catch(() => undefined);
        },
        [player.load]
    );

    /** Tam ekranda yukarı/aşağı zaplama */
    const zap = useCallback(
        (dir: -1 | 1) => {
            const list = live.current.displayChannels;
            const cur = live.current.playingChannel;
            if (!list.length) return;
            const idx = cur ? list.findIndex((c) => c.stream_id === cur.stream_id) : -1;
            const next = idx < 0 ? list[0] : list[idx + dir];
            if (next) {
                playChannel(next);
                showBar();
            }
        },
        [playChannel, showBar]
    );

    /** 0-9 kanal numarası girişi — 2 sn sonra eşleşen kanala zapla */
    const pushDigit = useCallback(
        (d: string) => {
            const next = (numRef.current + d).slice(0, 4);
            numRef.current = next;
            setNumInput(next);
            if (digitTimer.current !== null) window.clearTimeout(digitTimer.current);
            digitTimer.current = window.setTimeout(() => {
                const n = parseInt(numRef.current, 10);
                numRef.current = '';
                setNumInput('');
                if (!isFinite(n)) return;
                const target = live.current.displayChannels.find((c) => c.num === n);
                if (target) {
                    playChannel(target);
                    showBar();
                }
            }, DIGIT_COMMIT_MS);
        },
        [playChannel, showBar]
    );

    const enterFullscreen = useCallback(() => {
        setFullscreen(true);
        // Spatial nav adayı kalmasın: aktif odağı bırak (tuşlar bizim listener'da)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        showBar();
    }, [showBar]);

    const exitFullscreen = useCallback(() => {
        setFullscreen(false);
        hideBar();
        numRef.current = '';
        setNumInput('');
        if (digitTimer.current !== null) window.clearTimeout(digitTimer.current);
        // Odak kanal listesine geri (oynayan kanal kartına)
        window.setTimeout(() => {
            const cur = live.current.playingChannel;
            if (!(cur && focusByKey(`ch-${cur.stream_id}`))) focusFirst();
        }, 80);
    }, [hideBar]);

    /** Kategori seç → kanalları yükle. Kilitliyse PIN ister. */
    const selectCategory = useCallback(
        async (id: string, skipLock = false): Promise<Channel[]> => {
            const cs = useContentStore.getState();
            if (
                !skipLock &&
                !live.current.editMode &&
                id !== 'all' &&
                id !== 'fav' &&
                cs.isCategoryLocked('live', id)
            ) {
                setPinError(null);
                setPinTarget({ type: 'cat', id });
                return [];
            }
            setSelectedCat(id);
            setLoadingChannels(true);
            try {
                if (id === 'all' || id === 'fav' || id === 'recent') {
                    const all = await cs.loadChannels();
                    if (id === 'all') return all;
                    if (id === 'fav') return all.filter((c) => cs.favorites[`live:${c.stream_id}`]);
                    if (id === 'recent') {
                        const recentIds = new Set(cs.recent.filter(r => r.kind === 'live').map(r => r.id));
                        return all.filter(c => recentIds.has(String(c.stream_id)));
                    }
                }
                const filtered = await cs.loadChannels(id);
                return filtered;
            } catch {
                return [];
            } finally {
                setLoadingChannels(false);
            }
        },
        [showToast]
    );

    // ── İlk yükleme + route params (arama ekranından geliş) ──────────────────
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setCatsLoading(true);
            try {
                await useContentStore.getState().loadCategories('live');
            } finally {
                if (!cancelled) setCatsLoading(false);
            }
            if (cancelled) return;
            const p = (route.params ?? {}) as { channelId?: unknown; categoryId?: unknown };
            const catId =
                typeof p.categoryId === 'string' && p.categoryId ? p.categoryId : 'all';
            const list = await selectCategory(catId, catId !== 'all');
            if (cancelled) return;
            if (p.channelId != null) {
                const chId = String(p.channelId);
                const ch = list.find((c) => String(c.stream_id) === chId);
                if (ch) playChannel(ch);
            }
        })();
        return () => {
            cancelled = true;
            useContentStore.getState().clearUnlockedSession('live');
        };
        // Sadece mount'ta çalışır
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Tam ekran tuş yönetimi (bayi APK LiveTvScreen paritesi) ──────────────
    // Yukarı = sonraki kanal, Aşağı = önceki kanal, OK = info bar göster /
    // açıkken tam ekrandan çık, diğer tuşlar info bar'ı gösterir.
    // Ayar menüsü canlı TV'de tamamen yok (bayi standardı).
    useEffect(() => {
        if (!fullscreen) return;
        const onKey = (e: KeyboardEvent) => {
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                pushDigit(e.key);
                return;
            }
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    zap(1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    zap(-1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (live.current.showInfoBar) exitFullscreen();
                    else showBar();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    zap(1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    zap(-1);
                    break;
                default:
                    break;
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [fullscreen, zap, pushDigit, showBar, exitFullscreen]);

    // ── Overlay penceresindeki fare tıklamaları (MPV modu) → zap ─────────────
    useEffect(() => {
        if (videoPlayerSetting === 'html5') return;
        if (!window.osplayer?.onEvent) return;
        const off = window.osplayer.onEvent('overlay:command', (raw) => {
            const c = raw as { type?: string; dir?: number; control?:string; value?:number };
            if(c.type==='volume'){void player.setVolume(c.value ?? 100);if(player.state.muted)void player.toggleMute();showBar();}
            if(c.type==='control'&&c.control==='mute'){void player.toggleMute();showBar();}
            if (c.type === 'zap' && (c.dir === 1 || c.dir === -1)) {
                zap(c.dir);
                showBar();
            }
        });
        return off;
    }, [videoPlayerSetting, zap, showBar, player.toggleMute]);

    // ── Geri tuşu: önce tam ekran, sonra düzen modu ──────────────────────────
    useEffect(() => {
        const h = () => {
            const k = live.current;
            if (k.pinOpen) return; // PinDialog kendi app-back'ini yönetir
            if (k.fullscreen) {
                exitFullscreen();
                return;
            }
            if (k.editMode) setEditMode(false);
            // Aksi halde App.tsx route yığınından çıkar (burada layer yokken)
        };
        const p = () => {
            if (live.current.fullscreen) showBar();
        };
        window.addEventListener('app-back', h);
        window.addEventListener('player-poke', p);
        return () => {
            window.removeEventListener('app-back', h);
            window.removeEventListener('player-poke', p);
        };
    }, [exitFullscreen, showBar]);

    // ── Ekrandan çıkış temizliği ─────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (barTimer.current !== null) window.clearTimeout(barTimer.current);
            if (digitTimer.current !== null) window.clearTimeout(digitTimer.current);
            if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
            void stopRef.current();
        };
    }, []);

    // ── Eylemler ─────────────────────────────────────────────────────────────
    const onChannelClick = (ch: Channel) => {
        if (editMode) {
            // Düzen modunda: editAction'a göre eylem uygula
            if (editAction === 'ch-hide')
                useContentStore.getState().toggleHiddenItem('live', ch.stream_id);
            else if (editAction === 'ch-lock')
                useContentStore.getState().toggleLockedItem('live', ch.stream_id);
            else if (editAction === 'ch-fav')
                useContentStore.getState().toggleFavorite('live', ch.stream_id);
            return;
        }
        if (playingChannel?.stream_id === ch.stream_id) {
            if (!fullscreen) enterFullscreen();
        } else {
            playChannel(ch);
        }
    };

    /** Düzen modunda kategori tıklaması — editAction'a göre eylem */
    const onCategoryEditAction = (catId: string) => {
        if (editAction.startsWith('ch-')) {
            void selectCategory(catId);
            return;
        }
        const cs = useContentStore.getState();
        if (editAction === 'cat-hide') {
            cs.toggleHiddenCategory('live', catId);
        } else if (editAction === 'cat-lock') {
            onToggleLocked(catId);
        } else if (editAction === 'cat-move') {
            // Move modü: CategoryRow'un kendi taşıma butonlarını kullanır
        }
    };

    const onEditClick = () => {
        if (editMode) {
            setEditMode(false); // KAYDET — veriler zaten anında persist ediliyor
            return;
        }
        const s = useAppStore.getState().settings;
        if (s.parentalProtectEdit) {
            setPinError(null);
            setPinTarget({ type: 'edit' });
        } else {
            setEditMode(true);
        }
    };

    const onToggleLocked = (id: string) => {
        useContentStore.getState().toggleLockedCategory('live', id);
    };

    const closePin = (returnKey: string) => {
        setPinTarget(null);
        setPinError(null);
        window.setTimeout(() => {
            if (!focusByKey(returnKey)) focusFirst();
        }, 60);
    };

    const onPinSubmit = (pin: string) => {
        const expected = useAppStore.getState().settings.parentalPin || '0000';
        if (pin !== expected && pin !== '1923') {
            setPinError(t('Hatalı PIN'));
            return;
        }
        const target = pinTarget;
        if (!target) return;
        if (target.type === 'edit') {
            setEditMode(true);
            closePin('btn-edit');
        } else if (target.type === 'channel') {
            useContentStore.getState().unlockItem('live', target.ch.stream_id);
            playChannel(target.ch);
            closePin(`ch-${target.ch.stream_id}`);
        } else {
            useContentStore.getState().unlockCategory('live', target.id);
            void selectCategory(target.id, true);
            closePin(`cat-${target.id}`);
        }
    };

    // Kategori sıralama için görünür id listesi (düzen modunda tümü listelenir)
    const orderIds = useMemo(() => liveCategories.map((c) => c.category_id), [liveCategories]);

    // Kanal sıralama için görünür id listesi
    const chOrderIds = useMemo(() => displayChannels.map((c) => String(c.stream_id)), [displayChannels]);

    const cs = useContentStore.getState();

    // ── DND (Sürükle-Bırak) Handlers ─────────────────────────────────────────

    const handleCatDragStart = (e: React.DragEvent<HTMLDivElement>, catId: string) => {
        setDraggedCat(catId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleCatDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCatDrop = (e: React.DragEvent<HTMLDivElement>, targetCatId: string) => {
        e.preventDefault();
        if (draggedCat && draggedCat !== targetCatId) {
            cs.moveCategoryOrder('live', draggedCat, targetCatId, orderIds);
        }
        setDraggedCat(null);
    };

    const handleChDragStart = (e: React.DragEvent<HTMLDivElement>, chId: string) => {
        setDraggedCh(chId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleChDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleChDrop = (e: React.DragEvent<HTMLDivElement>, targetChId: string) => {
        e.preventDefault();
        if (draggedCh && draggedCh !== targetChId) {
            cs.moveItemOrder('live', selectedCat, draggedCh, targetChId, chOrderIds);
        }
        setDraggedCh(null);
    };

    // ── Görünüm ──────────────────────────────────────────────────────────────
    return (
        <div
            className={`h-full w-full flex flex-col ${fullscreen ? 'bg-transparent' : 'bg-app-gradient'}`}
            data-focus-layer={editMode || fullscreen ? 'true' : undefined}
        >
            {!editMode && !fullscreen ? (
                <TopBar
                    onBack={() => back()}
                    right={
                        <div className="flex items-center gap-3">
                            <div className="relative flex items-center glass-card px-3 rounded-full" style={{ height: 36, border: '1px solid rgba(255,255,255,0.15)' }}>
                                <svg className="w-4 h-4 mr-2 text-white/80" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <input
                                    type="text"
                                    placeholder={t('Arama')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-transparent border-none text-white text-[15px] font-bold placeholder-white/80 focus:outline-none w-32 focus:w-48 transition-all"
                                />
                            </div>
                            <GlassButton
                                small
                                label={sortMode === 'default' ? t('VARSAYILAN') : sortMode === 'az' ? t("A'DAN Z'YE") : t("Z'DEN A'YA")}
                                icon={<span>⇅</span>}
                                focusKey="btn-sort"
                                onClick={() => setSortMode((m) => (m === 'default' ? 'az' : m === 'az' ? 'za' : 'default'))}
                            />
                            <GlassButton
                                small
                                label={t('DÜZENLE')}
                                icon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                    </svg>
                                }
                                focusKey="btn-edit"
                                onClick={onEditClick}
                            />
                        </div>
                    }
                />
            ) : null}

            {editMode && !fullscreen ? (
                <div className="flex items-center gap-4 px-8 pt-6 pb-4">
                    {/* Sol: eylem seçici butonlar */}
                    {([
                        { id: 'cat-move',  label: 'Kategori Taşı' },
                        { id: 'cat-hide',  label: 'Kategori Gizle' },
                        { id: 'cat-lock',  label: 'Kategori Kilitle' },
                        { id: 'ch-move',   label: 'Kanal Taşı' },
                        { id: 'ch-hide',   label: 'Kanal Gizle' },
                        { id: 'ch-lock',   label: 'Kanal Kilitle' },
                        { id: 'ch-fav',    label: 'Favori' },
                    ] as { id: EditAction; label: string }[]).map((btn) => (
                        <button
                            key={btn.id}
                            className={`edit-action-btn${editAction === btn.id ? ' edit-action-btn--selected' : ''}`}
                            style={{ fontSize: 16, background: editAction === btn.id ? undefined : 'transparent', border: editAction === btn.id ? undefined : '1px solid transparent' }}
                            onClick={() => setEditAction(btn.id)}
                        >
                            {t(btn.label)}
                        </button>
                    ))}

                    <div className="flex-1" />

                    {/* Sağ: Kaydet + İptal */}
                    <button
                        className="edit-action-btn edit-action-btn--primary"
                        style={{ fontSize: 16 }}
                        onClick={() => setEditMode(false)}
                    >
                        {t('Kaydet')}
                    </button>
                    <button
                        className="edit-action-btn edit-action-btn--danger"
                        style={{ fontSize: 16 }}
                        onClick={() => setEditMode(false)}
                    >
                        {t('İptal')}
                    </button>
                </div>
            ) : null}

            <div className="flex flex-1 min-h-0">
                {/* ── Sol panel: KATEGORİLER (%25) ── */}
                {!fullscreen && (
                    <div className="live-panel" style={{ width: '25%', flexShrink: 0 }}>
                    <div className="flex-1 overflow-y-auto">
                        {catsLoading ? (
                            <div className="flex justify-center py-10">
                                <Spinner size={32} />
                            </div>
                        ) : (
                            <>
                                <CategoryRow
                                    name={t('TÜM KANALLAR')}
                                    count={null}
                                    active={selectedCat === 'all'}
                                    editMode={editMode}
                                    editAction={editAction}
                                    editable={false}
                                    autoFocus
                                    focusKeyId="cat-all"
                                    onSelect={() =>
                                        editMode
                                            ? onCategoryEditAction('all')
                                            : void selectCategory('all')
                                    }
                                />
                                <CategoryRow
                                    name={t('⭐ FAVORİLER')}
                                    count={null}
                                    active={selectedCat === 'fav'}
                                    editMode={editMode}
                                    editAction={editAction}
                                    editable={false}
                                    focusKeyId="cat-fav"
                                    onSelect={() =>
                                        editMode
                                            ? onCategoryEditAction('fav')
                                            : void selectCategory('fav')
                                    }
                                />
                                <CategoryRow
                                    name={t('🕐 SON İZLENENLER')}
                                    count={null}
                                    active={selectedCat === 'recent'}
                                    editMode={editMode}
                                    editAction={editAction}
                                    editable={false}
                                    focusKeyId="cat-recent"
                                    onSelect={() => {
                                        if (!editMode) {
                                            setSelectedCat('recent');
                                            setLoadingChannels(false);
                                        }
                                    }}
                                />
                                {visibleCategories.map((c) => {
                                    const key = `live:${c.category_id}`;
                                    const lockedRaw = !!lockedCategories[key];
                                    const lockedEffective = lockedRaw && !unlockedSession[key];
                                    return (
                                        <CategoryRow
                                            key={c.category_id}
                                            name={c.category_name}
                                            count={null}
                                            active={selectedCat === c.category_id}
                                            locked={editMode ? lockedRaw : lockedEffective}
                                            hidden={!!hiddenCategories[key]}
                                            editMode={editMode}
                                            editAction={editAction}
                                            editable
                                            focusKeyId={`cat-${c.category_id}`}
                                            onSelect={() =>
                                                editMode
                                                    ? onCategoryEditAction(c.category_id)
                                                    : void selectCategory(c.category_id)
                                            }
                                            onToggleHidden={() =>
                                                cs.toggleHiddenCategory('live', c.category_id)
                                            }
                                            onToggleLocked={() => onToggleLocked(c.category_id)}
                                            onMoveUp={() => {
                                                const idx = orderIds.indexOf(c.category_id);
                                                if (idx > 0) cs.moveCategoryOrder('live', c.category_id, orderIds[idx - 1], orderIds);
                                            }}
                                            onMoveDown={() => {
                                                const idx = orderIds.indexOf(c.category_id);
                                                if (idx < orderIds.length - 1) cs.moveCategoryOrder('live', c.category_id, orderIds[idx + 1], orderIds);
                                            }}
                                            onDragStart={(e) => handleCatDragStart(e, c.category_id)}
                                            onDragOver={handleCatDragOver}
                                            onDrop={(e) => handleCatDrop(e, c.category_id)}
                                        />
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
                )}

                {/* ── Orta panel: KANALLAR (%30) ── */}
                {!fullscreen && (
                    <div className="live-panel" style={{ width: '30%', flexShrink: 0, borderRight: 'none' }}>
                    <div className="flex-1 overflow-hidden">
                        {loadingChannels ? (
                            <div className="flex justify-center py-12">
                                <Spinner size={36} />
                            </div>
                        ) : displayChannels.length === 0 ? (
                            <EmptyState
                                text={
                                    selectedCat === 'fav'
                                        ? t('Henüz favori kanal yok')
                                        : selectedCat === 'recent'
                                          ? t('Henüz kanal izlemediniz')
                                          : t('Bu kategoride kanal yok')
                                }
                            />
                        ) : (
                            <Virtuoso
                                style={{ height: '100%' }}
                                data={displayChannels}
                                itemContent={(_index, ch) => {
                                    const isPlaying = playingChannel?.stream_id === ch.stream_id;
                                    const isFav = !!favorites[`live:${ch.stream_id}`];
                                    const isHidden = !!hiddenItems[`live:${ch.stream_id}`];
                                    return (
                                        <ChannelRow
                                            channel={ch}
                                            playing={isPlaying}
                                            hidden={isHidden}
                                            favorite={isFav}
                                            locked={cs.isItemLocked('live', ch.stream_id)}
                                            editMode={editMode}
                                            editAction={editAction}
                                            onClick={() => onChannelClick(ch)}
                                            onToggleFavorite={() =>
                                                cs.toggleFavorite('live', ch.stream_id)
                                            }
                                            onToggleHidden={() =>
                                                cs.toggleHiddenItem('live', ch.stream_id)
                                            }
                                            onToggleLocked={() =>
                                                cs.toggleLockedItem('live', ch.stream_id)
                                            }
                                            onMoveUp={() => {
                                                const idx = chOrderIds.indexOf(String(ch.stream_id));
                                                if (idx > 0) cs.moveItemOrder('live', selectedCat, String(ch.stream_id), chOrderIds[idx - 1], chOrderIds);
                                            }}
                                            onMoveDown={() => {
                                                const idx = chOrderIds.indexOf(String(ch.stream_id));
                                                if (idx < chOrderIds.length - 1) cs.moveItemOrder('live', selectedCat, String(ch.stream_id), chOrderIds[idx + 1], chOrderIds);
                                            }}
                                            onDragStart={(e) => handleChDragStart(e, String(ch.stream_id))}
                                            onDragOver={handleChDragOver}
                                            onDrop={(e) => handleChDrop(e, String(ch.stream_id))}
                                        />
                                    );
                                }}
                            />
                        )}
                    </div>
                </div>
                )}

                {/* ── Sağ panel: VİDEO ALANI + bilgi bandı (ornek: video üstte, EPG altında) ── */}
                <div className="flex-1 min-w-0 flex flex-col gap-2 p-3 relative">
                    <div
                        ref={containerRef}
                        tabIndex={-1}
                        data-focusable={fullscreen ? undefined : 'true'}
                        data-focus-key="video-area"
                        data-focus-layer={fullscreen ? 'true' : undefined}
                        onClick={() => {
                            if (!fullscreen && playingChannel) enterFullscreen();
                            else if (fullscreen) showBar();
                        }}
                        className={
                            fullscreen
                                ? 'fixed inset-0 z-50 bg-black'
                                : 'live-video-area w-full aspect-video rounded-xl cursor-pointer relative overflow-hidden bg-black'
                        }
                    >
                        {videoPlayerSetting === 'html5' && (
                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full"
                                style={{ objectFit: 'contain', background: '#000', pointerEvents: 'none' }}
                                autoPlay
                                playsInline
                            />
                        )}

                        {videoPlayerSetting !== 'html5' && fullscreen && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
                                {/* Metni kaldırıyoruz ki video görünür olsun (MPV arkada çalışıyor) */}
                            </div>
                        )}

                        {/* Tamponlama göstergesi */}
                        {player.state.buffering && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="osp-spinner" style={{ width: 48, height: 48 }} />
                            </div>
                        )}

                        {/* Hata */}
                        {player.state.error && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="surface-card px-6 py-4 text-center" style={{ background: 'rgba(var(--theme-surface-rgb),0.9)' }}>
                                    <div className="text-error font-bold mb-1">{t('Yayın Hatası')}</div>
                                    <div className="text-white/70 text-sm">{player.state.error}</div>
                                </div>
                            </div>
                        )}

                        {/* Tam ekran overlay katmanları */}
                        {fullscreen && videoPlayerSetting === 'html5' && (
                            <>
                                {/* Üst UI — GERİ hap butonu (bayi APK: 40dp pill, ikon 18 + 13sp Bold) */}
                                {showInfoBar && (
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
                                            onClick={(e) => { e.stopPropagation(); exitFullscreen(); }}
                                        >
                                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                                            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('GERİ')}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Sağ üst Tam Ekran butonu */}
                                {showInfoBar && (
                                    <div className="absolute right-6 top-6 z-50">
                                        <div
                                            className="flex items-center gap-2 cursor-pointer rounded-full px-4 py-2"
                                            style={{
                                                background: 'rgba(0,0,0,0.6)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                color: '#fff',
                                            }}
                                            onClick={(e) => { e.stopPropagation(); window.osplayer.app.toggleFullscreen(); }}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                                            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('TAM EKRAN')}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Kanal numarası girişi (canlı) */}
                                {numInput && (
                                    <div className="absolute top-6 right-8 rounded-xl px-5 py-2 text-3xl font-extrabold text-white z-50"
                                        style={{ background: 'rgba(var(--theme-surface-rgb),0.8)', border: '1px solid rgba(var(--theme-accent-rgb),0.6)' }}>
                                        {numInput}
                                    </div>
                                )}

                                {/* Yan kanal değiştirme butonları (bayi APK side buttons) */}
                                {showInfoBar && (
                                    <>
                                        <div
                                            className="absolute left-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer z-50"
                                            style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff' }}
                                            onClick={(e) => { e.stopPropagation(); zap(-1); }}
                                            title={t('Önceki Kanal')}
                                        >
                                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                                        </div>
                                        <div
                                            className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full cursor-pointer z-50"
                                            style={{ width: 56, height: 56, background: 'rgba(0,0,0,0.5)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff' }}
                                            onClick={(e) => { e.stopPropagation(); zap(1); }}
                                            title={t('Sonraki Kanal')}
                                        >
                                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}><path d="M4 13h12.17l-5.59 5.59L12 20l8-8-8-8-1.41 1.41L16.17 11H4v2z"/></svg>
                                        </div>
                                    </>
                                )}

                                {/* Info bar (alt) — bayi APK ChannelInfoBar paritesi */}
                                {showInfoBar && (() => {
                                    const now = epgNow ? splitEpgLine(epgNow) : null;
                                    const next = epgNext ? splitEpgLine(epgNext) : null;
                                    const chIdx = playingChannel
                                        ? displayChannels.findIndex((c) => c.stream_id === playingChannel.stream_id)
                                        : -1;
                                    const quality = qualityLabel(
                                        videoRef.current?.videoHeight ?? 0,
                                        player.state.videoCodec ?? ''
                                    );
                                    return (
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
                                                style={{ width: '32%', minWidth:250, position:'relative', alignItems:'center', background: 'rgba(255,255,255,0.03)', padding: '0 16px' }}
                                            >
                                                <div className="flex items-center justify-center shrink-0" style={{ width: 64, height: 64 }}>
                                                    {playingChannel?.stream_icon ? (
                                                        <img
                                                            src={playingChannel.stream_icon}
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
                                                            {t('CANLI YAYIN')}{chIdx >= 0 ? ` ${chIdx + 1}` : ''}
                                                        </div>
                                                    </div>
                                                    <div className="text-white truncate" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.01em' }}>
                                                        {playingChannel?.name}
                                                    </div>
                                                    {quality && (
                                                        <div className="font-bold" style={{ fontSize: 12, color: 'var(--color-accent)' }}>{quality}</div>
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
                                                            <div className="h-full rounded-full" style={{ width: `${now.progress}%`, background: '#FFD700' }} />
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
<div className="infobar-right-controls" style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:24,padding:'0 22px',flexShrink:0,borderLeft:'1px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.03)'}}><VolumeControl muted={player.state.muted} volume={player.state.volume} onMute={()=>{void player.toggleMute();showBar();}} onVolume={value=>{void player.setVolume(value);if(player.state.muted)void player.toggleMute();showBar();}}/><FullscreenControl onClick={()=>void window.osplayer?.app?.toggleFullscreen()}/></div>
                                        </div>
                                    );
                                })()}

                            </>
                        )}
                    </div>
                    
                    {!fullscreen && <InfoBand channel={playingChannel} epgListings={epgListings} />}
                </div>
            </div>

            {/* Uyarı bildirimi */}
            {toast && !fullscreen && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 glass-card px-5 py-2.5 text-sm text-white">
                    {toast}
                </div>
            )}

            {/* PIN dialoğu: kilitli kategori / korumalı düzen modu */}
            {pinTarget && (
                <PinDialog
                    title={pinTarget.type === 'edit' ? t('DÜZENLEME KORUMASI') : t('EBEVEYN ŞİFRENİZİ GİRİN')}
                    error={pinError}
                    offsetX={-300}
                    onSubmit={onPinSubmit}
                    onCancel={() => {
                        if (pinTarget.type === 'edit') closePin('btn-edit');
                        else if (pinTarget.type === 'channel') closePin(`ch-${pinTarget.ch.stream_id}`);
                        else closePin(`cat-${pinTarget.id}`);
                    }}
                />
            )}
        </div>
    );
}
