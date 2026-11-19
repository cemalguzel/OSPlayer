import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useContentStore } from '../store/contentStore';
import { EmptyState, Focusable, Spinner, TopBar } from '../components/common';
import { useT } from '../lib/i18n';
import type { Channel, Movie, Series } from '../types';

/** Arama ekranı — APK SearchScreen.kt karşılığı (input + 3 sekme + sonuç grid). */

type SearchTab = 'channels' | 'movies' | 'series';

const TABS: Array<{ key: SearchTab; label: string }> = [
    { key: 'channels', label: 'CANLI TV' },
    { key: 'movies', label: 'FİLMLER' },
    { key: 'series', label: 'DİZİLER' },
];

const MAX_RESULTS = 60;

/** Hata durumunda emoji yer tutucuya düşen görsel */
function MediaImage({
    src,
    className,
    fallback,
}: {
    src?: string;
    className?: string;
    fallback: string;
}) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (!src || failed) {
        return (
            <div className={`flex items-center justify-center bg-white/5 text-3xl ${className ?? ''}`}>
                <span className="opacity-40">{fallback}</span>
            </div>
        );
    }
    return (
        <img
            src={src}
            alt=""
            draggable={false}
            className={className}
            onError={() => setFailed(true)}
        />
    );
}

function ratingText(r?: string | number): string | null {
    if (r == null || r === '') return null;
    const n = Number(r);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n.toFixed(1);
}

export default function SearchScreen() {
    const t = useT();
    const back = useAppStore((s) => s.back);
    const push = useAppStore((s) => s.push);
    const client = useAppStore((s) => s.client);

    const allChannels = useContentStore((s) => s.allChannels);
    const allMovies = useContentStore((s) => s.allMovies);
    const allSeries = useContentStore((s) => s.allSeries);

    const [tab, setTab] = useState<SearchTab>('channels');
    const [raw, setRaw] = useState('');
    const [query, setQuery] = useState('');

    // Tüm listeleri arka planda yükle ('__all__')
    useEffect(() => {
        if (!client) return;
        const cs = useContentStore.getState();
        void cs.loadChannels();
        void cs.loadMovies();
        void cs.loadSeries();
    }, [client]);

    // 300ms debounce
    useEffect(() => {
        const timer = setTimeout(() => setQuery(raw), 300);
        return () => clearTimeout(timer);
    }, [raw]);

    const q = query.trim().toLocaleLowerCase('tr');

    const channelMatches = useMemo<Channel[]>(() => {
        if (q.length < 2 || !allChannels) return [];
        return allChannels.filter((c) => c.name.toLocaleLowerCase('tr').includes(q));
    }, [q, allChannels]);

    const movieMatches = useMemo<Movie[]>(() => {
        if (q.length < 2 || !allMovies) return [];
        return allMovies.filter((m) => m.name.toLocaleLowerCase('tr').includes(q));
    }, [q, allMovies]);

    const seriesMatches = useMemo<Series[]>(() => {
        if (q.length < 2 || !allSeries) return [];
        return allSeries.filter((s) => s.name.toLocaleLowerCase('tr').includes(q));
    }, [q, allSeries]);

    const channelResults = useMemo(() => channelMatches.slice(0, MAX_RESULTS), [channelMatches]);
    const movieResults = useMemo(() => movieMatches.slice(0, MAX_RESULTS), [movieMatches]);
    const seriesResults = useMemo(() => seriesMatches.slice(0, MAX_RESULTS), [seriesMatches]);

    const availableTabs = useMemo(() => {
        if (q.length < 2) return TABS.map((tabItem) => ({ key: tabItem.key, label: t(tabItem.label) }));
        const result: Array<{ key: SearchTab; label: string }> = [];
        if (channelMatches.length > 0) result.push({ key: 'channels', label: t('CANLI TV ({n})', { n: channelMatches.length }) });
        if (movieMatches.length > 0) result.push({ key: 'movies', label: t('FİLMLER ({n})', { n: movieMatches.length }) });
        if (seriesMatches.length > 0) result.push({ key: 'series', label: t('DİZİLER ({n})', { n: seriesMatches.length }) });
        return result;
    }, [t, q, channelMatches, movieMatches, seriesMatches]);

    useEffect(() => {
        if (q.length >= 2 && availableTabs.length > 0) {
            if (!availableTabs.find(tabItem => tabItem.key === tab)) {
                setTab(availableTabs[0].key);
            }
        }
    }, [availableTabs, q.length, tab]);

    const listLoading =
        (tab === 'channels' && allChannels === null) ||
        (tab === 'movies' && allMovies === null) ||
        (tab === 'series' && allSeries === null);

    const resultCount =
        tab === 'channels'
            ? channelResults.length
            : tab === 'movies'
              ? movieResults.length
              : seriesResults.length;

    return (
        <div className="bg-app-gradient h-full flex flex-col">
            <TopBar centerTitle={t('ARAMA')} onBack={() => back()} />

            {/* Arama girişi + sekmeler */}
            <div className="px-8 pb-4 flex flex-col items-center gap-4">
                <input
                    tabIndex={-1}
                    data-focusable
                    data-autofocus="true"
                    type="text"
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={t('Kanal, Film veya Dizi Ara...')}
                    className="w-full max-w-3xl rounded-xl px-5 py-4 text-white text-lg outline-none border text-center"
                    style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
                />
                <div className="flex gap-3 justify-center">
                    {availableTabs.map((tabItem) => (
                        <Focusable
                            key={tabItem.key}
                            focusKey={`search-tab-${tabItem.key}`}
                            onClick={() => setTab(tabItem.key)}
                            className={`px-8 py-2.5 rounded-lg cursor-pointer text-sm font-bold tracking-wider text-center ${
                                tab === tabItem.key ? 'bg-accent text-white' : 'glass-card text-white/60'
                            }`}
                        >
                            {tabItem.label}
                        </Focusable>
                    ))}
                </div>
            </div>

            {/* Sonuçlar */}
            <div className="flex-1 overflow-y-auto px-8 pb-8">
                {q.length < 2 ? (
                    <div className="flex items-center justify-center h-full text-white/35 text-sm">
                        {t('Aramak için en az 2 karakter girin')}
                    </div>
                ) : listLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Spinner />
                        <div className="text-white/50 text-sm">{t('İçerikler yükleniyor...')}</div>
                    </div>
                ) : resultCount === 0 ? (
                    <EmptyState text={t('Sonuç bulunamadı')} />
                ) : tab === 'channels' ? (
                    <div className="grid grid-cols-4 gap-3">
                        {channelResults.map((c) => (
                            <Focusable
                                key={c.stream_id}
                                onClick={() =>
                                    push('live', { channelId: c.stream_id, categoryId: c.category_id })
                                }
                                className="glass-card flex items-center gap-3 p-3 cursor-pointer"
                            >
                                <MediaImage
                                    src={c.stream_icon}
                                    fallback="📡"
                                    className="w-12 h-12 object-contain rounded shrink-0"
                                />
                                <div className="text-white text-sm font-medium truncate">{c.name}</div>
                            </Focusable>
                        ))}
                    </div>
                ) : tab === 'movies' ? (
                    <div className="grid grid-cols-5 gap-4">
                        {movieResults.map((m) => {
                            const r = ratingText(m.rating_5based ?? m.rating);
                            return (
                                <Focusable
                                    key={m.stream_id}
                                    onClick={() => push('movies', { movieId: m.stream_id })}
                                    className="glass-card overflow-hidden cursor-pointer flex flex-col"
                                >
                                    <div className="w-full" style={{ aspectRatio: '2 / 3' }}>
                                        <MediaImage
                                            src={m.stream_icon}
                                            fallback="🎬"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="p-2 flex flex-col justify-center" style={{ minHeight: '54px' }}>
                                        <div className="text-white text-[15px] font-medium line-clamp-2 leading-tight text-center">{m.name}</div>
                                    </div>
                                </Focusable>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid grid-cols-5 gap-4">
                        {seriesResults.map((s) => {
                            const r = ratingText(s.rating_5based ?? s.rating);
                            return (
                                <Focusable
                                    key={s.series_id}
                                    onClick={() => push('series', { seriesId: s.series_id })}
                                    className="glass-card overflow-hidden cursor-pointer flex flex-col"
                                >
                                    <div className="w-full" style={{ aspectRatio: '2 / 3' }}>
                                        <MediaImage
                                            src={s.cover}
                                            fallback="📺"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="p-2 flex flex-col justify-center" style={{ minHeight: '54px' }}>
                                        <div className="text-white text-[15px] font-medium line-clamp-2 leading-tight text-center">{s.name}</div>
                                    </div>
                                </Focusable>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
