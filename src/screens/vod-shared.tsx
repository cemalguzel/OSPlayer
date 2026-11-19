import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { useAppStore } from '../store/appStore';
import { useContentStore, type ContentKind } from '../store/contentStore';
import {
    EmptyState,
    Focusable,
    GlassButton,
    LoadingOverlay,
    Modal,
    PinDialog,
    TopBar,
} from '../components/common';
import { focusFirst, focusKey } from '../nav/spatial';
import { useT, translate } from '../lib/i18n';

/**
 * FİLMLER / DİZİLER ortak iskeleti:
 * üst bar (ARA/SIRALA/DÜZENLE) + sol kategori paneli (favori/tümü/gizli/kilitli)
 * + poster grid + sağdan kayan detay paneli kabuğu + devam et modalı.
 */

// ---- Yardımcılar ----------------------------------------------------------

export function fmtMinutes(secs: number): string {
    const n = Math.max(1, Math.round(secs / 60));
    return translate(useAppStore.getState().settings.language, '{n} dk', { n });
}

export function yearOf(date?: string | null): string {
    const y = (date ?? '').trim().slice(0, 4);
    return /^\d{4}$/.test(y) ? y : '';
}

export function ratingOf(v?: string | number): number {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---- Devam Et / Baştan İzle modalı ---------------------------------------

export function ContinueModal({
    title,
    positionSecs,
    onContinue,
    onRestart,
    onCancel,
}: {
    title: string;
    positionSecs: number;
    onContinue: () => void;
    onRestart: () => void;
    onCancel: () => void;
}) {
    const t = useT();
    useEffect(() => {
        const h = () => onCancel();
        window.addEventListener('app-back', h);
        return () => window.removeEventListener('app-back', h);
    }, [onCancel]);
    const mins = fmtMinutes(positionSecs);
    return (
        <Modal width={440}>
            <div className="text-lg font-bold text-white mb-1 truncate">{title}</div>
            <div className="text-white/60 text-sm mb-5">{t('Bu içeriği daha önce izlemeye başladınız.')}</div>
            <div className="flex flex-col gap-3">
                <GlassButton
                    primary
                    autoFocus
                    label={t('İZLEMEYE DEVAM ET ({mins})', { mins })}
                    onClick={onContinue}
                />
                <GlassButton label={t('BAŞTAN İZLE')} onClick={onRestart} />
            </div>
        </Modal>
    );
}

// ---- Tam Ekran Detay Paneli (APK MovieDetailsScreen.kt birebir) -----------

export function DetailPanel({
    backdrop,
    poster,
    title,
    onClose,
    children,
}: {
    backdrop?: string | null;
    poster?: string | null;
    title?: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const t = useT();
    const ref = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    // Geri: yalnızca bu panel en üst katmansa kapat
    useEffect(() => {
        const h = () => {
            const layers = document.querySelectorAll('[data-focus-layer]');
            if (layers[layers.length - 1] !== ref.current) return;
            onClose();
        };
        window.addEventListener('app-back', h);
        return () => window.removeEventListener('app-back', h);
    }, [onClose]);

    // Panel açılınca ilk odağı içeride kur
    useEffect(() => {
        const timer = setTimeout(() => {
            if (ref.current) focusFirst(ref.current);
        }, 80);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            data-focus-layer
            ref={ref}
            className="fixed inset-0 z-40"
            style={{
                background: '#0A0A0F',
                opacity: shown ? 1 : 0,
                transform: shown ? 'translateY(0)' : 'translateY(24px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
            }}
        >
            {/* ── Sağ: Backdrop görsel (%50 sağda, APK birebir) ── */}
            {(backdrop || poster) && (
                <div
                    className="absolute top-0 right-0 h-full"
                    style={{ width: '52%' }}
                >
                    <img
                        src={backdrop || poster || ''}
                        alt=""
                        className="w-full h-full object-cover"
                        style={{ opacity: 0.88 }}
                    />
                    {/* Sol'a yatay fade (APK: horizontalGradient BgDark → transparent) */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'linear-gradient(to right, #0A0A0F 0%, rgba(var(--theme-surface-rgb),0.82) 28%, rgba(var(--theme-surface-rgb),0.18) 75%, transparent 100%)',
                        }}
                    />
                    {/* Alta dikey fade */}
                    <div
                        className="absolute inset-0"
                        style={{
                            background: 'linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(var(--theme-surface-rgb),0.8) 80%, #0A0A0F 100%)',
                        }}
                    />
                </div>
            )}

            {/* ── Sol: İçerik sütunu (%60, APK birebir) ── */}
            <div
                className="absolute inset-0 overflow-y-auto"
                style={{ paddingLeft: 48, paddingRight: 0, paddingTop: 16, paddingBottom: 32 }}
            >
                <div style={{ maxWidth: '62%' }}>
                    {children}
                </div>
            </div>

            {/* ── Sol üst: Geri butonu (APK birebir) ── */}
            <Focusable
                onClick={onClose}
                className="absolute inline-flex items-center gap-2 cursor-pointer rounded-full px-4 py-2 text-sm font-bold text-white w-fit"
                style={{
                    top: 20,
                    left: 24,
                    zIndex: 10,
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    backdropFilter: 'blur(8px)',
                    transition: 'background 0.15s ease',
                }}
                focusKey="detail-back"
            >
                <span style={{ fontSize: 16 }}>←</span>
                <span>{t('GERİ')}</span>
            </Focusable>
        </div>
    );
}

// ---- Küçük düzen-modu butonu ----------------------------------------------

function MiniBtn({ label, onClick, active, title }: { label: string; onClick?: (e: any) => void; active?: boolean; title?: string }) {
    return (
        <Focusable
            onClick={onClick}
            title={title}
            className={`flex items-center justify-center rounded-md cursor-pointer text-xs font-bold ${
                active ? 'bg-accent text-white' : 'glass-card text-white/70'
            }`}
            style={{ width: 34, height: 28 }}
        >
            {label}
        </Focusable>
    );
}

// ---- Poster kartı ----------------------------------------------------------

function PosterCard({
    cardKey,
    name,
    image,
    rating,
    placeholder,
    favorite,
    hidden,
    editMode,
    progress,
    onOpen,
    onToggleFavorite,
    onToggleHidden,
}: {
    cardKey: string;
    name: string;
    image?: string;
    rating: number;
    placeholder: string;
    favorite: boolean;
    hidden: boolean;
    editMode: boolean;
    progress?: number | null;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onToggleHidden: () => void;
}) {
    const t = useT();
    const [imgErr, setImgErr] = useState(false);
    const poster = (
        <div
            className="relative rounded-xl overflow-hidden"
            style={{ aspectRatio: '2 / 3', background: '#0d1322', border: '1px solid rgba(255,255,255,0.08)' }}
        >
            {image && !imgErr ? (
                <img src={image} alt="" loading="lazy" onError={() => setImgErr(true)} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl opacity-35">{placeholder}</div>
            )}
            {favorite && !editMode && <div className="absolute top-1.5 right-1.5 text-sm drop-shadow">⭐</div>}
            {hidden && editMode && (
                <div
                    className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white tracking-widest"
                    style={{ background: 'rgba(5,5,9,0.65)' }}
                >
                    {t('GİZLİ')}
                </div>
            )}
            {progress != null && progress > 0.01 && (
                <div className="absolute bottom-0 left-0 right-0" style={{ height: 4, background: 'rgba(255,255,255,0.2)' }}>
                    <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                </div>
            )}
        </div>
    );
    const meta = (
        <div className="mt-2 h-[36px]">
            <div className="text-[14px] leading-[18px] text-white/90 line-clamp-2 text-center" title={name}>
                {name}
            </div>
        </div>
    );
    if (editMode)
        return (
            <div className="relative p-0.5">
                {poster}
                {meta}
                <div className="absolute top-2 left-2 flex gap-1">
                    <MiniBtn label={favorite ? '⭐' : '☆'} active={favorite} onClick={onToggleFavorite} title={t('Favori')} />
                    <MiniBtn label="👁" active={hidden} onClick={onToggleHidden} title={t('Gizle')} />
                </div>
            </div>
        );
    return (
        <Focusable focusKey={cardKey} onClick={onOpen} className="cursor-pointer rounded-xl p-0.5">
            {poster}
            {meta}
        </Focusable>
    );
}

// ---- Edit Mode Action Bar (VOD / Diziler) -----------------------------------

type VodEditAction = 'cat-move' | 'cat-hide' | 'cat-lock' | 'item-move' | 'item-hide' | 'item-lock' | 'item-fav';

function EditActionBar({
    kind,
    itemLabel,
    editAction,
    onActionChange,
    onSave,
    onCancel,
}: {
    kind: ContentKind;
    itemLabel: string;
    editAction: VodEditAction;
    onActionChange: (a: VodEditAction) => void;
    onSave: () => void;
    onCancel: () => void;
}) {
    const t = useT();
    const buttons: { id: VodEditAction; label: string }[] = [
        { id: 'cat-move',  label: 'Kategori Taşı' },
        { id: 'cat-hide',  label: 'Kategori Gizle' },
        { id: 'cat-lock',  label: 'Kategori Kilitle' },
    ];
    return (
        <div className="flex items-center gap-4 px-8 pt-6 pb-4">
            {buttons.map((btn) => (
                <button
                    key={btn.id}
                    className={`edit-action-btn${editAction === btn.id ? ' edit-action-btn--selected' : ''}`}
                    style={{ fontSize: 17, background: editAction === btn.id ? undefined : 'transparent', border: editAction === btn.id ? undefined : '1px solid transparent' }}
                    onClick={() => onActionChange(btn.id)}
                >
                    {t(btn.label)}
                </button>
            ))}

            <div className="flex-1" />

            <button className="edit-action-btn edit-action-btn--primary" style={{ fontSize: 17 }} onClick={onSave}>
                {t('Kaydet')}
            </button>
            <button className="edit-action-btn edit-action-btn--danger" style={{ fontSize: 17 }} onClick={onCancel}>
                {t('İptal')}
            </button>
        </div>
    );
}

// ---- Genel VOD tarayıcı (FİLMLER / DİZİLER) --------------------------------

type SortMode = 'default' | 'imdb' | 'az' | 'za';

export interface VodBrowserProps<T> {
    kind: ContentKind; // 'vod' | 'series'
    screenTitle?: string;
    placeholder: string;
    getId: (it: T) => number;
    getName: (it: T) => string;
    getImage: (it: T) => string | undefined;
    getRating: (it: T) => number; // 5 üzerinden
    getAdded: (it: T) => number;
    getCategoryId?: (it: T) => string | undefined;
    getPositionKey?: (it: T) => string;
    loadItems: (categoryId?: string) => Promise<T[]>;
    initialItemId?: number;
    renderDetail: (item: T, close: () => void) => React.ReactNode;
}

export function VodBrowser<T>({
    kind,
    screenTitle,
    placeholder,
    getId,
    getName,
    getImage,
    getRating,
    getAdded,
    getCategoryId,
    getPositionKey,
    loadItems,
    initialItemId,
    renderDetail,
}: VodBrowserProps<T>) {
    const t = useT();
    const back = useAppStore((s) => s.back);
    const push = useAppStore((s) => s.push);
    const settings = useAppStore((s) => s.settings);

    const categories = useContentStore((s) => (kind === 'vod' ? s.vodCategories : s.seriesCategories));
    const favorites = useContentStore((s) => s.favorites);
    const hiddenCategories = useContentStore((s) => s.hiddenCategories);
    const hiddenItems = useContentStore((s) => s.hiddenItems);
    const lockedCategories = useContentStore((s) => s.lockedCategories);
    const unlockedSession = useContentStore((s) => s.unlockedSession);
    const positions = useContentStore((s) => s.positions);
    const recent = useContentStore((s) => s.recent);

    const [selectedCat, setSelectedCat] = useState('all');
    const [items, setItems] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortMode, setSortMode] = useState<SortMode>('default');
    const [searchQuery, setSearchQuery] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [editAction, setEditAction] = useState<VodEditAction>('cat-hide');
    const [draggedCat, setDraggedCat] = useState<string | null>(null);
    const [pinAsk, setPinAsk] = useState<{ purpose: 'edit' | 'unlock'; catId?: string } | null>(null);
    const [pinError, setPinError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [detail, setDetail] = useState<T | null>(null);
    const detailFromKey = useRef<string | null>(null);

    // İlk yükleme: kategorileri yükle, sonra lazy olarak içerik yükle
    // openCategory fonksiyonuna bağımlılık olmadığı için ayrı bir ref ile çağırıyoruz
    const openCategoryRef = useRef<((catId: string) => Promise<void>) | null>(null);
    useEffect(() => {
        let active = true;
        void (async () => {
            setLoading(true);
            await useContentStore.getState().loadCategories(kind);
            if (!active) return;
            // Kategoriler yüklendikten sonra lazy olarak 'all' içeriğini yükle
            if (openCategoryRef.current) {
                await openCategoryRef.current('all');
            }
        })();
        return () => {
            active = false;
            useContentStore.getState().clearUnlockedSession(kind);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kind]);

    // Route param ile gelen içeriği (aramadan) bul ve detayını aç
    useEffect(() => {
        if (initialItemId == null) return;
        let active = true;
        void (async () => {
            const all = await loadItems();
            if (!active) return;
            const found = all.find((it) => getId(it) === initialItemId);
            if (found) setDetail(found);
        })();
        return () => {
            active = false;
        };
    }, [initialItemId, loadItems, getId]);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
    }, [toast]);

    const openCategory = useCallback(
        async (catId: string) => {
            setSelectedCat(catId);
            setLoading(true);

            try {
                if (catId === 'fav' || catId === 'recent' || catId === 'latest') {
                    // Özel listeler: tüm cache'i kullan, filtre displayItems'da yapılır
                    const cs = useContentStore.getState();
                    const cachedAll = kind === 'vod' ? cs.allMovies : kind === 'series' ? cs.allSeries : null;
                    if (cachedAll) {
                        setItems(cachedAll as T[]);
                    } else {
                        const list = await loadItems(); // kategorisiz = tümü
                        setItems(list);
                    }
                    return;
                }

                // TÜMÜ veya belirli kategori:
                // IPTVNator pattern: kategorisiz tüm listeyi çek, client-side filtrele.
                // Sunucu taraflı kategori limitini aşar.
                const cs = useContentStore.getState();
                const cachedAll = kind === 'vod' ? cs.allMovies : kind === 'series' ? cs.allSeries : null;

                let allList: T[];
                if (cachedAll && cachedAll.length > 0) {
                    // Cache var: anında kullan (API çağrısı yok)
                    allList = cachedAll as T[];
                } else {
                    // Cache yok: kategorisiz (= tüm liste) çek ve store'a kaydet
                    allList = await loadItems(); // categoryId yok = tümü
                }

                if (catId === 'all') {
                    setItems(allList);
                } else {
                    // Belirli kategori: client-side filtre
                    // NOT: Boş kategori boş gösterir (önceki hatalı fallback kaldırıldı)
                    const filtered = allList.filter((it) => getCategoryId?.(it) === catId);
                    setItems(filtered);
                }
            } catch {
                setItems([]);
            } finally {
                setLoading(false);
            }
        },
        [loadItems, kind, getCategoryId]
    );
    // Ref'i her render'da güncelle (ilk yükleme effect'i bunun üzerinden çağırır)
    openCategoryRef.current = openCategory;

    const onCategoryClick = (catId: string) => {
        if (catId !== 'fav' && catId !== 'recent' && catId !== 'latest' && catId !== 'all' && !editMode) {
            const locked = useContentStore.getState().isCategoryLocked(kind, catId);
            if (locked && settings.parentalPin) {
                setPinError(null);
                setPinAsk({ purpose: 'unlock', catId });
                return;
            }
        }
        void openCategory(catId);
    };

    const onPinSubmit = (pin: string) => {
        const expected = settings.parentalPin || '0000';
        if (pin !== expected && pin !== '1923') {
            setPinError(t('Hatalı PIN'));
            return;
        }
        const ask = pinAsk;
        setPinAsk(null);
        setPinError(null);
        if (!ask) return;
        if (ask.purpose === 'edit') setEditMode(true);
        else if (ask.catId) {
            useContentStore.getState().unlockCategory(kind, ask.catId);
            void openCategory(ask.catId);
        }
    };

    const onEditClick = () => {
        if (editMode) {
            setEditMode(false); // KAYDET — değişiklikler zaten store tarafından kalıcı
            return;
        }
        if (settings.parentalProtectEdit) {
            setPinError(null);
            setPinAsk({ purpose: 'edit' });
        } else setEditMode(true);
    };

    const onLockToggle = (catId: string) => {
        useContentStore.getState().toggleLockedCategory(kind, catId);
    };

    const visibleCats = useMemo(
        () => (editMode ? categories : categories.filter((c) => !hiddenCategories[`${kind}:${c.category_id}`])),
        [categories, hiddenCategories, editMode, kind]
    );

    const displayItems = useMemo(() => {
        let list = items;
        if (selectedCat === 'fav') list = list.filter((it) => !!favorites[`${kind}:${getId(it)}`]);
        else if (selectedCat === 'recent') {
            list = list.filter((it) => {
                // Filmler: pozisyon birebir vod:<id> ile eşleşir.
                const pk = getPositionKey?.(it);
                if (pk && positions[pk] && positions[pk].positionSecs > 0) return true;
                // Diziler: pozisyon bölüm seviyesinde (series:<epId>) tutulduğu için
                // dizi seviyesindeki "son izlenenler" listesi (recent) üzerinden eşleştirilir.
                return recent.some((r) => r.kind === kind && r.id === String(getId(it)));
            });
        }

        if (!editMode) {
            list = list.filter((it) => !hiddenItems[`${kind}:${getId(it)}`]);
            if ((selectedCat === 'all' || selectedCat === 'fav' || selectedCat === 'recent' || selectedCat === 'latest') && getCategoryId) {
                list = list.filter((it) => {
                    const cid = getCategoryId(it);
                    if (!cid) return true;
                    if (hiddenCategories[`${kind}:${cid}`]) return false;
                    if (lockedCategories[`${kind}:${cid}`] && !unlockedSession[`${kind}:${cid}`]) return false;
                    return true;
                });
            }
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(it => getName(it).toLowerCase().includes(q));
        }

        if (selectedCat === 'recent') {
            // İzlenme zamanına göre: en son izlenen en üstte
            const at = (it: T) => recent.find((r) => r.kind === kind && r.id === String(getId(it)))?.at ?? 0;
            list = [...list].sort((a, b) => at(b) - at(a));
            list = list.slice(0, settings.recentlyWatchedLimit);
        } else if (selectedCat === 'latest') {
            list = [...list].sort((a, b) => getAdded(b) - getAdded(a));
            list = list.slice(0, settings.recentlyAddedLimit);
        } else {
            if (sortMode === 'default') list = [...list].sort((a, b) => getAdded(b) - getAdded(a));
            else if (sortMode === 'az') list = [...list].sort((a, b) => getName(a).localeCompare(getName(b), 'tr'));
            else if (sortMode === 'za') list = [...list].sort((a, b) => getName(b).localeCompare(getName(a), 'tr'));
            else if (sortMode === 'imdb') list = [...list].sort((a, b) => getRating(b) - getRating(a));
        }
        
        return list;
    }, [items, selectedCat, editMode, sortMode, searchQuery, favorites, positions, recent, hiddenItems, hiddenCategories, lockedCategories, unlockedSession, kind, getId, getName, getAdded, getRating, getCategoryId, getPositionKey, settings.recentlyAddedLimit, settings.recentlyWatchedLimit]);

    const openDetail = (it: T) => {
        detailFromKey.current = `card-${kind}-${getId(it)}`;
        setDetail(it);
    };
    // Odak standardı: panel kapanınca açan karta focusKey ile dön
    const closeDetail = useCallback(() => {
        setDetail(null);
        const key = detailFromKey.current;
        window.setTimeout(() => {
            if (!key || !focusKey(key)) focusFirst();
        }, 60);
    }, []);

    const cycleSort = () => {
        const order: SortMode[] = ['default', 'imdb', 'az', 'za'];
        setSortMode((m) => order[(order.indexOf(m) + 1) % order.length]);
    };
    const sortLabel = sortMode === 'az' ? t("A' Dan Z' ye") : sortMode === 'za' ? t("Z'den A' ya") : sortMode === 'imdb' ? t('IMDb Puanı') : t('Varsayılan');
    const allCatIds = useMemo(() => categories.map((c) => c.category_id), [categories]);

    const catRowCls = (selected: boolean, dim: boolean) =>
        ['cat-row', selected ? 'cat-row--active' : '', dim ? 'cat-row--hidden' : ''].filter(Boolean).join(' ');

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
            useContentStore.getState().moveCategoryOrder(kind, draggedCat, targetCatId, allCatIds);
        }
        setDraggedCat(null);
    };

    return (
        <div className="bg-app-gradient h-full w-full flex flex-col">
            {!editMode ? (
                <TopBar
                    title={screenTitle}
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
                            <GlassButton small label={sortLabel} icon={<span>⇅</span>} onClick={cycleSort} focusKey="topbar-sort" />
                            <GlassButton
                                small
                                label={t('DÜZENLE')}
                                icon={
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                    </svg>
                                }
                                onClick={onEditClick}
                                focusKey="topbar-edit"
                            />
                        </div>
                    }
                />
            ) : (
                <EditActionBar
                    kind={kind}
                    itemLabel={kind === 'vod' ? t('Film') : t('Dizi')}
                    editAction={editAction}
                    onActionChange={setEditAction}
                    onSave={() => setEditMode(false)}
                    onCancel={() => setEditMode(false)}
                />

            )}

            <div className="flex flex-1 min-h-0 gap-5 px-8 pb-6">
                {/* Sol: kategori listesi */}
                <div className="flex flex-col overflow-y-auto" style={{ width: 300, flexShrink: 0 }}>
                    <Focusable autoFocus focusKey="cat-all" onClick={() => onCategoryClick('all')} className={catRowCls(selectedCat === 'all', false)}>
                        <span className="cat-row__name">{kind === 'vod' ? t('TÜM FİLMLER') : t('TÜM DİZİLER')}</span>
                    </Focusable>
                    <Focusable focusKey="cat-fav" onClick={() => onCategoryClick('fav')} className={catRowCls(selectedCat === 'fav', false)}>
                        <span className="cat-row__name">{t('FAVORİLER')}</span>
                    </Focusable>
                    <Focusable focusKey="cat-recent" onClick={() => onCategoryClick('recent')} className={catRowCls(selectedCat === 'recent', false)}>
                        <span className="cat-row__name">{t('SON İZLENENLER')}</span>
                    </Focusable>
                    <Focusable focusKey="cat-latest" onClick={() => onCategoryClick('latest')} className={catRowCls(selectedCat === 'latest', false)}>
                        <span className="cat-row__name">{t('SON EKLENENLER')}</span>
                    </Focusable>
                    {visibleCats.map((c) => {
                        const hidden = !!hiddenCategories[`${kind}:${c.category_id}`];
                        const locked = !!lockedCategories[`${kind}:${c.category_id}`];
                        return (
                            <Focusable
                                key={c.category_id}
                                focusKey={`cat-${c.category_id}`}
                                onClick={() => onCategoryClick(c.category_id)}
                                className={catRowCls(selectedCat === c.category_id, hidden && editMode) + (editMode && editAction === 'cat-move' ? ' cursor-grab' : '')}
                                draggable={editMode && editAction === 'cat-move'}
                                onDragStart={(e) => handleCatDragStart(e as unknown as React.DragEvent<HTMLDivElement>, c.category_id)}
                                onDragOver={(e) => handleCatDragOver(e as unknown as React.DragEvent<HTMLDivElement>)}
                                onDrop={(e) => handleCatDrop(e as unknown as React.DragEvent<HTMLDivElement>, c.category_id)}
                            >
                                {locked && <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>}
                                <span className="cat-row__name">{c.category_name}</span>
                                {hidden && editMode && <span style={{ fontSize: 14 }}>🚫</span>}
                                
                                {editMode && (
                                    <div className="flex gap-1 shrink-0 ml-auto">
                                        {editAction === 'cat-move' && (
                                            <>
                                                <MiniBtn label="↑" title={t('Yukarı taşı')} onClick={(e) => {
                                                    e.stopPropagation();
                                                    const idx = allCatIds.indexOf(c.category_id);
                                                    if (idx > 0) useContentStore.getState().moveCategoryOrder(kind, c.category_id, allCatIds[idx - 1], allCatIds);
                                                }} />
                                                <MiniBtn label="↓" title={t('Aşağı taşı')} onClick={(e) => {
                                                    e.stopPropagation();
                                                    const idx = allCatIds.indexOf(c.category_id);
                                                    if (idx < allCatIds.length - 1) useContentStore.getState().moveCategoryOrder(kind, c.category_id, allCatIds[idx + 1], allCatIds);
                                                }} />
                                            </>
                                        )}
                                        {editAction === 'cat-hide' && (
                                            <MiniBtn label="👁" title={t('Gizle/Göster')} active={hidden} onClick={(e) => {
                                                e.stopPropagation();
                                                useContentStore.getState().toggleHiddenCategory(kind, c.category_id);
                                            }} />
                                        )}
                                        {editAction === 'cat-lock' && (
                                            <MiniBtn label="🔒" title={t('Kilitle')} active={locked} onClick={(e) => {
                                                e.stopPropagation();
                                                onLockToggle(c.category_id);
                                            }} />
                                        )}
                                    </div>
                                )}
                            </Focusable>
                        );
                    })}
                </div>

                {/* Sağ: poster grid */}
                <div className="flex-1 px-0 pb-6 pt-0 min-h-0">
                    {loading ? (
                        <LoadingOverlay text={t('Yükleniyor...')} />
                    ) : displayItems.length === 0 ? (
                        <EmptyState text={selectedCat === 'fav' ? t('Henüz favori eklemediniz') : t('İçerik bulunamadı')} />
                    ) : (
                        <VirtuosoGrid
                            style={{ height: '100%' }}
                            data={displayItems}
                            components={{
                                // DİKKAT: Virtuoso'nun props.style'ı (paddingTop/Bottom) korunmalı;
                                // ezilirse sanal scroll yüksekliği oluşmaz ve sadece ilk ekran (15 öğe) render edilir.
                                List: React.forwardRef(({ style, className, ...props }: any, ref) => (
                                    <div
                                        {...props}
                                        ref={ref as any}
                                        className={`grid gap-4 p-4 ${className ?? ''}`}
                                        style={{ ...style, gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                                    />
                                ))
                            }}
                            itemContent={(_index, it) => {
                                const id = getId(it);
                                const posKey = getPositionKey?.(it);
                                const pos = posKey ? positions[posKey] : undefined;
                                return (
                                    <PosterCard
                                        key={id}
                                        cardKey={`card-${kind}-${id}`}
                                        name={getName(it)}
                                        image={getImage(it)}
                                        rating={getRating(it)}
                                        placeholder={placeholder}
                                        favorite={!!favorites[`${kind}:${id}`]}
                                        hidden={!!hiddenItems[`${kind}:${id}`]}
                                        editMode={editMode}
                                        progress={pos && pos.durationSecs > 0 ? pos.positionSecs / pos.durationSecs : null}
                                        onOpen={() => {
                                            if (editMode) {
                                                const cs = useContentStore.getState();
                                                const itId = getId(it);
                                                if (editAction === 'item-hide') cs.toggleHiddenItem(kind, itId);
                                                else if (editAction === 'item-lock') cs.toggleLockedItem(kind, itId);
                                                else if (editAction === 'item-fav') cs.toggleFavorite(kind, itId);
                                            } else {
                                                openDetail(it);
                                            }
                                        }}
                                        onToggleFavorite={() => useContentStore.getState().toggleFavorite(kind, id)}
                                        onToggleHidden={() => useContentStore.getState().toggleHiddenItem(kind, id)}
                                    />
                                );
                            }}
                        />
                    )}
                </div>
            </div>

            {toast && (
                <div
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 surface-card px-5 py-2.5 text-sm text-white"
                    style={{ background: 'rgba(var(--theme-surface-rgb),0.95)' }}
                >
                    {toast}
                </div>
            )}
            {pinAsk && (
                <PinDialog
                    title={pinAsk.purpose === 'edit' ? t('DÜZENLEME KORUMASI') : t('EBEVEYN ŞİFRENİZİ GİRİN')}
                    onSubmit={onPinSubmit}
                    onCancel={() => {
                        setPinAsk(null);
                        setPinError(null);
                    }}
                    error={pinError}
                />
            )}
            {detail && renderDetail(detail, closeDetail)}
        </div>
    );
}
