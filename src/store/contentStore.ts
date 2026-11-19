import { create } from 'zustand';
import { storeGet, storeSet } from '../lib/ipc';
import { useAppStore } from './appStore';
import { idbGet, idbSet } from '../lib/idb';
import type { Category, Channel, Movie, PlaybackPosition, Series } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

async function getCache<T>(key: string): Promise<T | null> {
    const data = await idbGet<{ value: T; timestamp: number }>(key);
    if (!data) return null;
    if (Date.now() - data.timestamp > CACHE_TTL_MS) return null;
    return data.value;
}

async function setCache<T>(key: string, value: T): Promise<void> {
    await idbSet(key, { value, timestamp: Date.now() });
}

/**
 * İçerik durumu: kategoriler + içerik önbelleği (oturum boyunca bellekte)
 * ve kalıcı kullanıcı verileri (favoriler, kaldığın yer, gizli/kilitli, son izlenen).
 * Kalıcı anahtarlar hesaba göre ayrılır: `${ns}:${accountKey}`
 */

export type ContentKind = 'live' | 'vod' | 'series';

interface PersistMaps {
    favorites: Record<string, boolean>; // key: kind:id
    hiddenCategories: Record<string, boolean>; // key: kind:category_id
    hiddenItems: Record<string, boolean>; // key: kind:id
    lockedCategories: Record<string, boolean>; // key: kind:category_id
    lockedItems: Record<string, boolean>; // key: kind:id
    categoryOrder: Record<string, string[]>; // key: kind -> category_id[]
    itemOrder: Record<string, string[]>; // key: kind:category_id -> id[]
    positions: Record<string, PlaybackPosition>; // key: vod:id | series:epId
    recent: Array<{ kind: ContentKind; id: string; name: string; image?: string; at: number }>;
    lastUpdateLive?: number;
    lastUpdateVod?: number;
    lastUpdateSeries?: number;
}

const EMPTY_PERSIST: PersistMaps = {
    favorites: {},
    hiddenCategories: {},
    hiddenItems: {},
    lockedCategories: {},
    lockedItems: {},
    categoryOrder: {},
    itemOrder: {},
    positions: {},
    recent: [],
    lastUpdateLive: 0,
    lastUpdateVod: 0,
    lastUpdateSeries: 0,
};

interface ContentState extends PersistMaps {
    liveCategories: Category[];
    vodCategories: Category[];
    seriesCategories: Category[];
    channelsByCat: Record<string, Channel[]>;
    moviesByCat: Record<string, Movie[]>;
    seriesByCat: Record<string, Series[]>;
    allChannels: Channel[] | null;
    allMovies: Movie[] | null;
    allSeries: Series[] | null;
    loading: boolean;
    lastRefresh: number;
    unlockedSession: Record<string, boolean>; // bu oturumda PIN ile açılan kilitler
    // Her içerik türü için ayrı yükleme durumu (UI spinner kontrolü)
    loadingLive: boolean;
    loadingVod: boolean;
    loadingSeries: boolean;

    accountKey: () => string;
    loadPersist: () => Promise<void>;
    savePersist: () => Promise<void>;

    loadCategories: (kind: ContentKind, force?: boolean) => Promise<Category[]>;
    loadChannels: (categoryId?: string, force?: boolean) => Promise<Channel[]>;
    loadMovies: (categoryId?: string, force?: boolean) => Promise<Movie[]>;
    loadSeries: (categoryId?: string, force?: boolean) => Promise<Series[]>;
    loadAll: (kind: ContentKind, force?: boolean) => Promise<void>;

    toggleFavorite: (kind: ContentKind, id: string | number) => void;
    isFavorite: (kind: ContentKind, id: string | number) => boolean;
    toggleHiddenCategory: (kind: ContentKind, categoryId: string) => void;
    toggleHiddenItem: (kind: ContentKind, id: string | number) => void;
    toggleLockedCategory: (kind: ContentKind, categoryId: string) => void;
    unlockCategory: (kind: ContentKind, categoryId: string) => void;
    isCategoryLocked: (kind: ContentKind, categoryId: string) => boolean;
    toggleLockedItem: (kind: ContentKind, id: string | number) => void;
    unlockItem: (kind: ContentKind, id: string | number) => void;
    isItemLocked: (kind: ContentKind, id: string | number) => boolean;
    moveCategoryOrder: (kind: ContentKind, fromId: string, toId: string, visibleIds: string[]) => void;
    moveItemOrder: (kind: ContentKind, categoryId: string, fromId: string, toId: string, visibleIds: string[]) => void;
    clearHiddenItems: (kind: ContentKind) => void;
    clearHiddenCategories: (kind: ContentKind) => void;
    clearLockedCategories: (kind: ContentKind) => void;
    clearLockedItems: (kind: ContentKind) => void;

    setPosition: (key: string, positionSecs: number, durationSecs: number, name?: string) => void;
    getPosition: (key: string) => PlaybackPosition | null;
    clearPosition: (key: string) => void;
    addRecent: (kind: ContentKind, id: string, name: string, image?: string) => void;
    clearRecent: (kind: ContentKind) => void;
    clearUnlockedSession: (kind?: ContentKind) => void;

    reset: () => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
    ...EMPTY_PERSIST,
    liveCategories: [],
    vodCategories: [],
    seriesCategories: [],
    channelsByCat: {},
    moviesByCat: {},
    seriesByCat: {},
    allChannels: null,
    allMovies: null,
    allSeries: null,
    loading: false,
    lastRefresh: 0,
    unlockedSession: {},
    loadingLive: false,
    loadingVod: false,
    loadingSeries: false,

    accountKey: () => {
        const acc = useAppStore.getState().activeAccount;
        return acc ? `${acc.serverUrl ?? 'panel'}|${acc.username}` : 'none';
    },

    loadPersist: async () => {
        const key = get().accountKey();
        const data = await storeGet<PersistMaps>(`userdata:${key}`, EMPTY_PERSIST);
        set({ ...EMPTY_PERSIST, ...data });
    },

    savePersist: async () => {
        const s = get();
        const data: PersistMaps = {
            favorites: s.favorites,
            hiddenCategories: s.hiddenCategories,
            hiddenItems: s.hiddenItems,
            lockedCategories: s.lockedCategories,
            lockedItems: s.lockedItems,
            categoryOrder: s.categoryOrder,
            itemOrder: s.itemOrder,
            positions: s.positions,
            recent: s.recent,
            lastUpdateLive: s.lastUpdateLive,
            lastUpdateVod: s.lastUpdateVod,
            lastUpdateSeries: s.lastUpdateSeries,
        };
        await storeSet(`userdata:${s.accountKey()}`, data);
    },

    loadCategories: async (kind, force = false) => {
        const client = useAppStore.getState().client;
        if (!client) return [];
        const field =
            kind === 'live' ? 'liveCategories' : kind === 'vod' ? 'vodCategories' : 'seriesCategories';
        const cached = get()[field] as Category[];
        if (cached.length && !force) return cached;
        
        const cacheKey = `cache_${get().accountKey()}_${kind}_categories`;
        let cats: Category[] | null = null;
        if (!force) cats = await getCache<Category[]>(cacheKey);

        if (!cats) {
            cats =
                (kind === 'live'
                    ? await client.getLiveCategories()
                    : kind === 'vod'
                      ? await client.getVodCategories()
                      : await client.getSeriesCategories()) ?? [];
            await setCache(cacheKey, cats);
        }

        // Kayıtlı sıralamayı uygula
        const order = get().categoryOrder[kind];
        if (order?.length) {
            cats.sort((a, b) => {
                const ia = order.indexOf(a.category_id);
                const ib = order.indexOf(b.category_id);
                return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
            });
        }
        set({ [field]: cats } as Partial<ContentState>);
        return cats;
    },

    loadChannels: async (categoryId, force = false) => {
        const client = useAppStore.getState().client;
        if (!client) return [];

        const state = get();
        if (!categoryId) {
            if (state.allChannels && !force) return state.allChannels;
            set({ loadingLive: true });
            try {
                const cacheKey = `cache_${state.accountKey()}_live_streams`;
                let list: Channel[] | null = null;
                if (!force) list = await getCache<Channel[]>(cacheKey);

                if (!list) {
                    list = (await client.getLiveStreams()) ?? [];
                    await setCache(cacheKey, list);
                    set({ lastUpdateLive: Date.now() });
                    void get().savePersist();
                }

                set((s) => ({
                    allChannels: list,
                    channelsByCat: { ...s.channelsByCat, __all__: list! },
                    lastRefresh: Date.now(),
                }));
                return list;
            } finally {
                set({ loadingLive: false });
            }
        } else {
            let allList = state.allChannels;
            if (!allList || force) {
                set({ loadingLive: true });
                try {
                    const cacheKey = `cache_${state.accountKey()}_live_streams`;
                    if (!force) allList = await getCache<Channel[]>(cacheKey);
                    
                    if (!allList) {
                        allList = (await client.getLiveStreams()) ?? [];
                        await setCache(cacheKey, allList);
                        set({ lastUpdateLive: Date.now() });
                        void get().savePersist();
                    }

                    set((s) => ({
                        allChannels: allList,
                        channelsByCat: { ...s.channelsByCat, __all__: allList! },
                        lastRefresh: Date.now(),
                    }));
                } finally {
                    set({ loadingLive: false });
                }
            }
            const filtered = (allList ?? []).filter((c) => String(c.category_id) === String(categoryId));
            set((s) => ({ channelsByCat: { ...s.channelsByCat, [categoryId]: filtered } }));
            return filtered;
        }
    },

    loadMovies: async (categoryId, force = false) => {
        const client = useAppStore.getState().client;
        if (!client) return [];

        const state = get();
        if (!categoryId) {
            if (state.allMovies && !force) return state.allMovies;
            set({ loadingVod: true });
            try {
                const cacheKey = `cache_${state.accountKey()}_vod_streams`;
                let list: Movie[] | null = null;
                if (!force) list = await getCache<Movie[]>(cacheKey);

                if (!list) {
                    list = (await client.getVodStreams()) ?? [];
                    await setCache(cacheKey, list);
                    set({ lastUpdateVod: Date.now() });
                    void get().savePersist();
                }

                set((s) => ({
                    allMovies: list,
                    moviesByCat: { ...s.moviesByCat, __all__: list! },
                    lastRefresh: Date.now(),
                }));
                return list;
            } finally {
                set({ loadingVod: false });
            }
        } else {
            let allList = state.allMovies;
            if (!allList || force) {
                set({ loadingVod: true });
                try {
                    const cacheKey = `cache_${state.accountKey()}_vod_streams`;
                    if (!force) allList = await getCache<Movie[]>(cacheKey);
                    
                    if (!allList) {
                        allList = (await client.getVodStreams()) ?? [];
                        await setCache(cacheKey, allList);
                        set({ lastUpdateVod: Date.now() });
                        void get().savePersist();
                    }

                    set((s) => ({
                        allMovies: allList,
                        moviesByCat: { ...s.moviesByCat, __all__: allList! },
                        lastRefresh: Date.now(),
                    }));
                } finally {
                    set({ loadingVod: false });
                }
            }
            const filtered = (allList ?? []).filter((m) => String(m.category_id) === String(categoryId));
            set((s) => ({ moviesByCat: { ...s.moviesByCat, [categoryId]: filtered } }));
            return filtered;
        }
    },

    loadSeries: async (categoryId, force = false) => {
        const client = useAppStore.getState().client;
        if (!client) return [];

        const state = get();
        if (!categoryId) {
            if (state.allSeries && !force) return state.allSeries;
            set({ loadingSeries: true });
            try {
                const cacheKey = `cache_${state.accountKey()}_series_streams`;
                let list: Series[] | null = null;
                if (!force) list = await getCache<Series[]>(cacheKey);

                if (!list) {
                    list = (await client.getSeries()) ?? [];
                    await setCache(cacheKey, list);
                    set({ lastUpdateSeries: Date.now() });
                    void get().savePersist();
                }

                set((s) => ({
                    allSeries: list,
                    seriesByCat: { ...s.seriesByCat, __all__: list! },
                    lastRefresh: Date.now(),
                }));
                return list;
            } finally {
                set({ loadingSeries: false });
            }
        } else {
            let allList = state.allSeries;
            if (!allList || force) {
                set({ loadingSeries: true });
                try {
                    const cacheKey = `cache_${state.accountKey()}_series_streams`;
                    if (!force) allList = await getCache<Series[]>(cacheKey);
                    
                    if (!allList) {
                        allList = (await client.getSeries()) ?? [];
                        await setCache(cacheKey, allList);
                        set({ lastUpdateSeries: Date.now() });
                        void get().savePersist();
                    }

                    set((s) => ({
                        allSeries: allList,
                        seriesByCat: { ...s.seriesByCat, __all__: allList! },
                        lastRefresh: Date.now(),
                    }));
                } finally {
                    set({ loadingSeries: false });
                }
            }
            const filtered = (allList ?? []).filter((s) => String(s.category_id) === String(categoryId));
            set((s) => ({ seriesByCat: { ...s.seriesByCat, [categoryId]: filtered } }));
            return filtered;
        }
    },

    loadAll: async (kind, force = false) => {
        if (kind === 'live') await get().loadChannels(undefined, force);
        else if (kind === 'vod') await get().loadMovies(undefined, force);
        else await get().loadSeries(undefined, force);
    },

    toggleFavorite: (kind, id) => {
        const key = `${kind}:${id}`;
        set((s) => {
            const favorites = { ...s.favorites };
            if (favorites[key]) delete favorites[key];
            else favorites[key] = true;
            return { favorites };
        });
        void get().savePersist();
    },
    isFavorite: (kind, id) => !!get().favorites[`${kind}:${id}`],

    toggleHiddenCategory: (kind, categoryId) => {
        const key = `${kind}:${categoryId}`;
        set((s) => {
            const hiddenCategories = { ...s.hiddenCategories };
            if (hiddenCategories[key]) delete hiddenCategories[key];
            else hiddenCategories[key] = true;
            return { hiddenCategories };
        });
        void get().savePersist();
    },
    toggleHiddenItem: (kind, id) => {
        const key = `${kind}:${id}`;
        set((s) => {
            const hiddenItems = { ...s.hiddenItems };
            if (hiddenItems[key]) delete hiddenItems[key];
            else hiddenItems[key] = true;
            return { hiddenItems };
        });
        void get().savePersist();
    },
    toggleLockedCategory: (kind, id) => {
        const key = `${kind}:${id}`;
        set((s) => {
            const next = { ...s.lockedCategories };
            if (next[key]) delete next[key];
            else next[key] = true;
            return { lockedCategories: next };
        });
        void get().savePersist();
    },
    unlockCategory: (kind, id) => {
        const key = `${kind}:${id}`;
        set((s) => ({ unlockedSession: { ...s.unlockedSession, [key]: true } }));
    },
    isCategoryLocked: (kind, id) => {
        const key = `${kind}:${id}`;
        const s = get();
        return !!s.lockedCategories[key] && !s.unlockedSession[key];
    },
    toggleLockedItem: (kind, id) => {
        const key = `${kind}:${id}`;
        set((s) => {
            const next = { ...s.lockedItems };
            if (next[key]) delete next[key];
            else next[key] = true;
            return { lockedItems: next };
        });
        void get().savePersist();
    },
    unlockItem: (kind, id) => {
        const key = `item_${kind}:${id}`;
        set((s) => ({ unlockedSession: { ...s.unlockedSession, [key]: true } }));
    },
    isItemLocked: (kind, id) => {
        const keyMap = `${kind}:${id}`;
        const keySess = `item_${kind}:${id}`;
        const s = get();
        return !!s.lockedItems[keyMap] && !s.unlockedSession[keySess];
    },
    clearUnlockedSession: (kind) => {
        if (!kind) {
            set({ unlockedSession: {} });
        } else {
            set((s) => {
                const unlockedSession = { ...s.unlockedSession };
                Object.keys(unlockedSession).forEach((k) => {
                    if (k.startsWith(`${kind}:`) || k.startsWith(`item_${kind}:`)) {
                        delete unlockedSession[k];
                    }
                });
                return { unlockedSession };
            });
        }
    },

    moveCategoryOrder: (kind, fromId, toId, visibleIds) => {
        const s = get();
        let order = s.categoryOrder[kind] ? [...s.categoryOrder[kind]] : [];
        if (!order.length) order = [...visibleIds];

        const fromIdx = order.indexOf(fromId);
        const toIdx = order.indexOf(toId);

        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

        // Öğeyi çıkar ve hedefe yerleştir
        const [movedItem] = order.splice(fromIdx, 1);
        order.splice(toIdx, 0, movedItem);

        set((s) => ({ categoryOrder: { ...s.categoryOrder, [kind]: order } }));
        const field =
            kind === 'live' ? 'liveCategories' : kind === 'vod' ? 'vodCategories' : 'seriesCategories';
        const cats = [...(get()[field] as Category[])];
        cats.sort((a, b) => {
            const ia = order.indexOf(a.category_id);
            const ib = order.indexOf(b.category_id);
            return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
        });
        set({ [field]: cats } as Partial<ContentState>);
        void get().savePersist();
    },

    moveItemOrder: (kind, categoryId, fromId, toId, visibleIds) => {
        const s = get();
        const key = `${kind}:${categoryId}`;
        let order = s.itemOrder[key] ? [...s.itemOrder[key]] : [];
        if (!order.length) order = [...visibleIds];

        const fromIdx = order.indexOf(fromId);
        const toIdx = order.indexOf(toId);

        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

        // Öğeyi çıkar ve hedefe yerleştir
        const [movedItem] = order.splice(fromIdx, 1);
        order.splice(toIdx, 0, movedItem);

        set((s) => ({ itemOrder: { ...s.itemOrder, [key]: order } }));
        void get().savePersist();
    },

    clearHiddenItems: (kind) => {
        set((s) => {
            const hiddenItems = { ...s.hiddenItems };
            // Bu kind'a ait tüm kayıtları sil
            Object.keys(hiddenItems).forEach((k) => {
                if (k.startsWith(`${kind}:`)) delete hiddenItems[k];
            });
            return { hiddenItems };
        });
        void get().savePersist();
    },

    clearHiddenCategories: (kind) => {
        set((s) => {
            const hiddenCategories = { ...s.hiddenCategories };
            Object.keys(hiddenCategories).forEach((k) => {
                if (k.startsWith(`${kind}:`)) delete hiddenCategories[k];
            });
            return { hiddenCategories };
        });
        void get().savePersist();
    },

    clearLockedCategories: (kind) => {
        set((s) => {
            const lockedCategories = { ...s.lockedCategories };
            const unlockedSession = { ...s.unlockedSession };
            Object.keys(lockedCategories).forEach((k) => {
                if (k.startsWith(`${kind}:`)) {
                    delete lockedCategories[k];
                    delete unlockedSession[k];
                }
            });
            return { lockedCategories, unlockedSession };
        });
        void get().savePersist();
    },

    clearLockedItems: (kind) => {
        set((s) => {
            const lockedItems = { ...s.lockedItems };
            const unlockedSession = { ...s.unlockedSession };
            Object.keys(lockedItems).forEach((k) => {
                if (k.startsWith(`${kind}:`)) {
                    delete lockedItems[k];
                    delete unlockedSession[`item_${k}`];
                }
            });
            return { lockedItems, unlockedSession };
        });
        void get().savePersist();
    },

    setPosition: (key, positionSecs, durationSecs, name) => {
        set((s) => ({
            positions: {
                ...s.positions,
                [key]: { key, positionSecs, durationSecs, updatedAt: Date.now(), name },
            },
        }));
        void get().savePersist();
    },
    getPosition: (key) => get().positions[key] ?? null,
    clearPosition: (key) => {
        set((s) => {
            const positions = { ...s.positions };
            delete positions[key];
            return { positions };
        });
        void get().savePersist();
    },

    addRecent: (kind, id, name, image) => {
        set((s) => {
            const recent = [
                { kind, id, name, image, at: Date.now() },
                ...s.recent.filter((r) => !(r.kind === kind && r.id === id)),
            ].slice(0, 30);
            return { recent };
        });
        void get().savePersist();
    },

    clearRecent: (kind) => {
        set((s) => {
            const recent = s.recent.filter((r) => r.kind !== kind);
            // Filmler ve diziler için oynatma pozisyonlarını da temizle.
            let positions = s.positions;
            if (kind === 'vod' || kind === 'series') {
                const prefix = kind === 'vod' ? 'vod:' : 'series:';
                positions = Object.fromEntries(
                    Object.entries(s.positions).filter(([k]) => !k.startsWith(prefix)),
                );
            }
            return { recent, positions };
        });
        void get().savePersist();
    },

    reset: () =>
        set({
            ...EMPTY_PERSIST,
            liveCategories: [],
            vodCategories: [],
            seriesCategories: [],
            channelsByCat: {},
            moviesByCat: {},
            seriesByCat: {},
            allChannels: null,
            allMovies: null,
            allSeries: null,
            lastRefresh: 0,
            unlockedSession: {},
            loadingLive: false,
            loadingVod: false,
            loadingSeries: false,
        }),
}));
