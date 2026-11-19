import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore, useCurrentRoute } from '../store/appStore';
import { useContentStore } from '../store/contentStore';
import { Focusable, GlassButton, Spinner } from '../components/common';
import { focusKey } from '../nav/spatial';
import { tmdbImage, tmdbLogo, tmdbReady, tmdbTv, youtubeTrailerKey, type TmdbDetails } from '../lib/tmdb';
import VodPlayer from '../player/VodPlayer';
import { ContinueModal, DetailPanel, VodBrowser, ratingOf, yearOf } from './vod-shared';
import { useT } from '../lib/i18n';
import type { PlaybackPosition, Series, SeriesEpisode, SeriesInfo } from '../types';

/**
 * DİZİLER ekranı — APK SeriesScreen.kt + SeriesDetailsScreen.kt karşılığı.
 * İskelet vod-shared.VodBrowser; detay panelinde tam ekran Netflix tarzı:
 * sol %60 içerik (başlık/meta/özet/butonlar/oyuncu şeridi + SEZONLAR bölümü),
 * sağ %52 backdrop görsel fade gradyanla.
 */

// ---- Stabil erişimciler (VodBrowser prop'ları) -----------------------------
const getId = (s: Series) => s.series_id;
const getName = (s: Series) => s.name;
const getImage = (s: Series) => s.cover;
const getRating = (s: Series) => ratingOf(s.rating_5based);
const getAdded = (s: Series) => {
    const lm = Number((s as unknown as Record<string, unknown>).last_modified);
    if (Number.isFinite(lm) && lm > 0) return lm;
    const d = Date.parse(s.releaseDate ?? s.release_date ?? '');
    return Number.isFinite(d) ? d / 1000 : 0;
};
const getCategoryId = (s: Series) => String(s.category_id);
const loadItems = (categoryId?: string) => useContentStore.getState().loadSeries(categoryId);

// ---- Dizi detay paneli (APK birebir tam ekran) --------------------------------

function SeriesDetail({ series, onClose }: { series: Series; onClose: () => void }) {
    const t = useT();
    const client = useAppStore((s) => s.client);
    const isFav = useContentStore((s) => !!s.favorites[`series:${series.series_id}`]);
    const positions = useContentStore((s) => s.positions);
    const [info, setInfo] = useState<SeriesInfo | null>(null);
    const [tmdb, setTmdb] = useState<TmdbDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [season, setSeason] = useState<string | null>(null);
    const [playback, setPlayback] = useState<{ ep: SeriesEpisode; seasonKey: string; startAt?: number } | null>(null);
    const [askContinue, setAskContinue] = useState<{ ep: SeriesEpisode; seasonKey: string; pos: PlaybackPosition } | null>(null);
    const [showEpisodes, setShowEpisodes] = useState(false);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setInfo(null);
        setTmdb(null);
        setSeason(null);
        void (async () => {
            const si = client ? await client.getSeriesInfo(series.series_id) : null;
            if (!active) return;
            setInfo(si);
            setLoading(false);
            if (!tmdbReady()) return;
            const tid = si?.info?.tmdb_id ?? si?.info?.tmdb ?? series.tmdb_id ?? series.tmdb;
            if (tid) {
                const t = await tmdbTv(tid);
                if (active) setTmdb(t);
            }
        })();
        return () => { active = false; };
    }, [client, series]);

    const seasonKeys = useMemo(() => Object.keys(info?.episodes ?? {}).sort((a, b) => Number(a) - Number(b)), [info]);
    useEffect(() => {
        if (season == null && seasonKeys.length) setSeason(seasonKeys[0]);
    }, [seasonKeys, season]);
    const activeSeason = season ?? seasonKeys[0] ?? '';
    const episodes = useMemo(() => info?.episodes?.[activeSeason] ?? [], [info, activeSeason]);

    const i = info?.info;
    const title = tmdb?.name || i?.name || series.name;
    const logo = tmdbLogo(tmdb);
    const backdrop = tmdbImage(tmdb?.backdrop_path, 'w1280') ?? i?.backdrop_path?.[0] ?? series.backdrop_path?.[0] ?? null;
    const poster = tmdbImage(tmdb?.poster_path, 'w342') ?? i?.cover ?? series.cover;
    const year = yearOf(tmdb?.first_air_date ?? i?.releaseDate ?? series.releaseDate ?? series.release_date);
    const genre = tmdb?.genres?.map((g) => g.name).join(', ') || i?.genre || series.genre || '';
    const runTime = i?.episode_run_time || series.episode_run_time || '';
    const ratingNum = tmdb?.vote_average || Number(i?.rating) || Number(series.rating) || 0;
    const plot = tmdb?.overview || i?.plot || series.plot || '';
    const actors =
        tmdb?.credits?.cast?.slice(0, 6).map((c) => c.name).join(', ') ||
        i?.cast || series.cast || '';
    const director = tmdb?.credits?.crew?.find((c) => c.job === 'Director')?.name || i?.director || series.director || '';
    const trailer = youtubeTrailerKey(tmdb) ?? (i?.youtube_trailer?.trim() || series.youtube_trailer?.trim() || null);

    const playerTitle = useCallback(
        (ep: SeriesEpisode, seasonKey: string) => `${title} S${ep.season ?? seasonKey}B${ep.episode_num}`,
        [title]
    );

    const playEpisode = useCallback((ep: SeriesEpisode, seasonKey: string, startAt?: number) => {
        useContentStore.getState().addRecent('series', String(series.series_id), series.name, series.cover);
        setAskContinue(null);
        setPlayback({ ep, seasonKey, startAt });
    }, [series]);

    const onEpisodeClick = (ep: SeriesEpisode, seasonKey: string) => {
        const pos = useContentStore.getState().getPosition(`series:${ep.id}`);
        if (pos && pos.positionSecs > 10 && (pos.durationSecs <= 0 || pos.positionSecs / pos.durationSecs < 0.97))
            setAskContinue({ ep, seasonKey, pos });
        else playEpisode(ep, seasonKey);
    };

    const refocusEpisode = (epId: string) => window.setTimeout(() => focusKey(`ep-${epId}`), 60);

    const playNextEpisode = useCallback(() => {
        if (!playback) return;
        const currentSeasonKey = playback.seasonKey;
        const currentEpId = playback.ep.id;
        const currentSeasonEpisodes = info?.episodes?.[currentSeasonKey] ?? [];
        const currentIndex = currentSeasonEpisodes.findIndex(e => e.id === currentEpId);
        
        if (currentIndex >= 0 && currentIndex < currentSeasonEpisodes.length - 1) {
            playEpisode(currentSeasonEpisodes[currentIndex + 1], currentSeasonKey, 0);
            return;
        }
        
        const currentSeasonIndex = seasonKeys.indexOf(currentSeasonKey);
        if (currentSeasonIndex >= 0 && currentSeasonIndex < seasonKeys.length - 1) {
            const nextSeasonKey = seasonKeys[currentSeasonIndex + 1];
            const nextSeasonEpisodes = info?.episodes?.[nextSeasonKey] ?? [];
            if (nextSeasonEpisodes.length > 0) {
                playEpisode(nextSeasonEpisodes[0], nextSeasonKey, 0);
            }
        }
    }, [playback, info, seasonKeys, playEpisode]);

    const hasNextEpisode = useMemo(() => {
        if (!playback) return false;
        const currentSeasonKey = playback.seasonKey;
        const currentEpId = playback.ep.id;
        const currentSeasonEpisodes = info?.episodes?.[currentSeasonKey] ?? [];
        const currentIndex = currentSeasonEpisodes.findIndex(e => e.id === currentEpId);
        
        if (currentIndex >= 0 && currentIndex < currentSeasonEpisodes.length - 1) return true;
        
        const currentSeasonIndex = seasonKeys.indexOf(currentSeasonKey);
        if (currentSeasonIndex >= 0 && currentSeasonIndex < seasonKeys.length - 1) {
            const nextSeasonKey = seasonKeys[currentSeasonIndex + 1];
            if ((info?.episodes?.[nextSeasonKey]?.length ?? 0) > 0) return true;
        }
        return false;
    }, [playback, info, seasonKeys]);

    // Bölümler paneli (bayi APK chapters): oynayan sezonun bölüm listesi,
    // panelden seçilince o bölüme geçilir
    const chapterEpisodes = useMemo(
        () => (playback ? info?.episodes?.[playback.seasonKey] ?? [] : []),
        [playback, info]
    );
    const playerChapters = useMemo(
        () =>
            chapterEpisodes.map((e) => ({
                label: e.title ? t('Bölüm {n}: {title}', { n: e.episode_num, title: e.title }) : t('Bölüm {n}', { n: e.episode_num }),
                current: playback ? e.id === playback.ep.id : false,
            })),
        [chapterEpisodes, playback]
    );
    const onChapterSelect = useCallback(
        (i: number) => {
            if (!playback) return;
            const ep = chapterEpisodes[i];
            if (ep && ep.id !== playback.ep.id) playEpisode(ep, playback.seasonKey, 0);
        },
        [playback, chapterEpisodes, playEpisode]
    );

    const openTrailer = () => {
        if (!trailer) return;
        const url = trailer.startsWith('http') ? trailer : `https://www.youtube.com/watch?v=${trailer}`;
        void window.osplayer.app.openExternal(url);
    };

    return (
        <DetailPanel backdrop={backdrop} poster={poster} onClose={onClose}>
            {/* Boşluk: geri butonu için */}
            <div style={{ height: 68 }} />

            {/* Büyük başlık — TMDB logo (isim görseli) varsa onu, yoksa düz metni göster */}
            {logo ? (
                <img
                    src={logo}
                    alt={title}
                    style={{ maxWidth: 420, maxHeight: 130, objectFit: 'contain', objectPosition: 'left center', marginBottom: 16, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
                />
            ) : (
                <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 16, letterSpacing: 0.5 }}>
                    {title}
                </div>
            )}

            {/* Meta: Yıl • Tür • Süre/bölüm • IMDb */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20, fontSize: 15, color: 'rgba(255,255,255,0.75)' }}>
                {year && <span style={{ fontWeight: 700, color: '#fff' }}>{year}</span>}
                {runTime && <><span style={{ opacity: 0.4 }}>•</span><span>{t('{n} dk/bölüm', { n: runTime })}</span></>}
                {genre && <><span style={{ opacity: 0.4 }}>•</span><span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{genre}</span></>}
                {ratingNum > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ opacity: 0.4 }}>•</span>
                        <span style={{ background: '#F5C518', borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 900, color: '#000' }}>IMDb</span>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{ratingNum.toFixed(1)}</span>
                    </div>
                )}
                {loading && <Spinner size={18} />}
            </div>

            {/* Özet */}
            {plot && (
                <div className="line-clamp-3" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.6, marginBottom: 12, maxWidth: '90%' }}>
                    {plot}
                </div>
            )}

            {actors && (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{t('Oyuncular: ')}</span>{actors}
                </div>
            )}
            {director && (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 18 }}>
                    <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{t('Yönetmen: ')}</span>{director}
                </div>
            )}

            {/* Aksiyon butonları */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
                <GlassButton primary label={t('SEZONLAR VE BÖLÜMLER')} icon={<span>▶</span>} onClick={() => setShowEpisodes(true)} autoFocus focusKey="detail-episodes" />
                <GlassButton
                    small
                    label={isFav ? t('FAVORİDEN ÇIKAR') : t('FAVORİ EKLE')}
                    icon={<span style={{ fontSize: 14 }}>{isFav ? '❤️' : '🤍'}</span>}
                    onClick={() => useContentStore.getState().toggleFavorite('series', series.series_id)}
                    focusKey="detail-fav"
                />
                {trailer && <GlassButton small label={t('FRAGMAN')} icon={<span>🎞️</span>} onClick={openTrailer} />}
            </div>

            {/* Oyuncu Kadrosu şeridi */}
            {tmdb?.credits?.cast && tmdb.credits.cast.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 10 }}>{t('Oyuncu Kadrosu')}</div>
                    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                        {tmdb.credits.cast.slice(0, 15).map((actor) => (
                            <div key={actor.name} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 82 }}>
                                <div style={{ width: 72, height: 96, borderRadius: 8, overflow: 'hidden', background: '#0d1322', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 5 }}>
                                    {actor.profile_path ? (
                                        <img src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, opacity: 0.3 }}>👤</div>
                                    )}
                                </div>
                                <div style={{ color: '#fff', fontSize: 10, fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{actor.name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── SEZONLAR PANELI (Butona tıklandığında açılır) ── */}
            {showEpisodes && (
                <DetailPanel backdrop={backdrop} poster={poster} onClose={() => { setShowEpisodes(false); window.setTimeout(() => focusKey('detail-episodes'), 60); }}>
                    {/* Boşluk: geri butonu için */}
                    <div style={{ height: 68 }} />

                    {/* Büyük başlık — TMDB logo varsa onu, yoksa düz metni göster */}
                    {logo ? (
                        <img
                            src={logo}
                            alt={title}
                            style={{ maxWidth: 420, maxHeight: 130, objectFit: 'contain', objectPosition: 'left center', marginBottom: 16, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))' }}
                        />
                    ) : (
                        <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 16, letterSpacing: 0.5 }}>
                            {title}
                        </div>
                    )}

                    <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', marginBottom: 10 }}>{t('SEZONLAR VE BÖLÜMLER')}</div>

                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
                            <Spinner size={32} />
                        </div>
                    ) : seasonKeys.length === 0 ? (
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>{t('Bölüm bilgisi bulunamadı')}</div>
                    ) : (
                        <div style={{ display: 'flex', gap: 12, minHeight: 0, flex: 1, height: 'calc(100vh - 220px)', paddingLeft: 4, paddingRight: 4 }}>
                            {/* Sol: sezon listesi */}
                            <div className="px-2 py-2" style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flexShrink: 0, width: 208 }}>
                                {seasonKeys.map((sk) => (
                                    <Focusable
                                        key={sk}
                                        focusKey={`season-${sk}`}
                                        onClick={() => setSeason(sk)}
                                        className={`focus-subtle rounded-lg px-4 py-3 text-sm font-bold cursor-pointer flex items-center justify-between gap-3 ${activeSeason === sk ? 'bg-accent text-white' : 'glass-card text-white/75'}`}
                                    >
                                        <span style={{ whiteSpace: 'nowrap' }}>{t('{n}. Sezon', { n: sk })}</span>
                                        <span style={{ fontSize: 11, fontWeight: 500, opacity: activeSeason === sk ? 0.8 : 0.5, whiteSpace: 'nowrap' }}>
                                            {t('{n} Bölüm', { n: info?.episodes?.[sk]?.length || 0 })}
                                        </span>
                                    </Focusable>
                                ))}
                            </div>
                            {/* Sağ: bölüm listesi */}
                            <div className="px-2 py-2" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {episodes.map((ep) => {
                                    const pos = positions[`series:${ep.id}`];
                                    const ratio = pos && pos.durationSecs > 0 ? pos.positionSecs / pos.durationSecs : 0;
                                    const plot = (ep as any).plot || ep.info?.plot || ep.info?.description || '';
                                    return (
                                        <Focusable
                                            key={ep.id}
                                            focusKey={`ep-${ep.id}`}
                                            onClick={() => onEpisodeClick(ep, activeSeason)}
                                            className="focus-subtle glass-card px-5 py-4 cursor-pointer"
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                                <span
                                                    style={{ borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', background: 'rgba(var(--theme-accent-rgb),0.35)', border: '1px solid rgba(var(--theme-accent-rgb),0.6)' }}
                                                >
                                                    B{ep.episode_num}
                                                </span>
                                                <span style={{ flex: 1, fontSize: 16, color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                                    {ep.title || t('Bölüm {n}', { n: ep.episode_num })}
                                                </span>
                                                {ep.info?.duration && (
                                                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>{ep.info.duration}</span>
                                                )}
                                            </div>
                                            {plot && (
                                                <div className="line-clamp-2" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 8, paddingLeft: 56, lineHeight: 1.5 }}>
                                                    {plot}
                                                </div>
                                            )}
                                            {ratio > 0.01 && (
                                                <div style={{ marginTop: 8, borderRadius: 4, overflow: 'hidden', height: 4, background: 'rgba(255,255,255,0.15)' }}>
                                                    <div style={{ height: '100%', background: 'var(--color-accent)', width: `${Math.min(100, ratio * 100)}%` }} />
                                                </div>
                                            )}
                                        </Focusable>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </DetailPanel>
            )}

            {askContinue && (
                <ContinueModal
                    title={playerTitle(askContinue.ep, askContinue.seasonKey)}
                    positionSecs={askContinue.pos.positionSecs}
                    onContinue={() => playEpisode(askContinue.ep, askContinue.seasonKey, askContinue.pos.positionSecs)}
                    onRestart={() => playEpisode(askContinue.ep, askContinue.seasonKey, 0)}
                    onCancel={() => { const epId = askContinue.ep.id; setAskContinue(null); refocusEpisode(epId); }}
                />
            )}
            {playback && (
                <VodPlayer
                    title={playerTitle(playback.ep, playback.seasonKey)}
                    url={client ? client.seriesUrl(playback.ep.id, playback.ep.container_extension || 'mp4') : ''}
                    positionKey={`series:${playback.ep.id}`}
                    startAt={playback.startAt}
                    isSeries={true}
                    hasNext={hasNextEpisode}
                    onNext={playNextEpisode}
                    chapters={playerChapters}
                    onChapterSelect={onChapterSelect}
                    onExit={() => { const epId = playback.ep.id; setPlayback(null); refocusEpisode(epId); }}
                />
            )}
        </DetailPanel>
    );
}

// ---- Ekran -------------------------------------------------------------------

export default function SeriesScreen() {
    const route = useCurrentRoute();
    const seriesId = route.params?.seriesId != null ? Number(route.params.seriesId) : undefined;

    return (
        <VodBrowser<Series>
            kind="series"
            placeholder="📺"
            getId={getId}
            getName={getName}
            getImage={getImage}
            getRating={getRating}
            getAdded={getAdded}
            getCategoryId={getCategoryId}
            loadItems={loadItems}
            initialItemId={seriesId}
            renderDetail={(series, close) => <SeriesDetail series={series} onClose={close} />}
        />
    );
}
