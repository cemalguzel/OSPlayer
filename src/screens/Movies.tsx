import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore, useCurrentRoute } from '../store/appStore';
import { useContentStore } from '../store/contentStore';
import { GlassButton, Spinner } from '../components/common';
import { focusKey } from '../nav/spatial';
import { tmdbImage, tmdbLogo, tmdbMovie, tmdbReady, youtubeTrailerKey, type TmdbDetails } from '../lib/tmdb';
import VodPlayer from '../player/VodPlayer';
import { ContinueModal, DetailPanel, VodBrowser, fmtMinutes, ratingOf, yearOf } from './vod-shared';
import { useT } from '../lib/i18n';
import type { Movie, PlaybackPosition, VodInfo } from '../types';

/**
 * FİLMLER ekranı — APK MoviesScreen.kt + MovieDetailsScreen.kt karşılığı.
 * Liste/grid/kategori iskeleti vod-shared.VodBrowser'dan; bu dosya film
 * detay panelini (TMDB zenginleştirme + tam ekran Netflix tarzı layout) ekler.
 */

// ---- Stabil erişimciler (VodBrowser prop'ları) -----------------------------
const getId = (m: Movie) => m.stream_id;
const getName = (m: Movie) => m.name;
const getImage = (m: Movie) => m.stream_icon;
const getRating = (m: Movie) => ratingOf(m.rating_5based);
const getAdded = (m: Movie) => Number(m.added ?? 0) || 0;
const getCategoryId = (m: Movie) => String(m.category_id);
const getPositionKey = (m: Movie) => `vod:${m.stream_id}`;
const loadItems = (categoryId?: string) => useContentStore.getState().loadMovies(categoryId);

// ---- Film detay paneli (APK MovieDetailsScreen.kt birebir) -----------------

function MovieDetail({ movie, onClose }: { movie: Movie; onClose: () => void }) {
    const t = useT();
    const client = useAppStore((s) => s.client);
    const isFav = useContentStore((s) => !!s.favorites[`vod:${movie.stream_id}`]);
    const [info, setInfo] = useState<VodInfo | null>(null);
    const [tmdb, setTmdb] = useState<TmdbDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [playback, setPlayback] = useState<{ startAt?: number } | null>(null);
    const [askContinue, setAskContinue] = useState<PlaybackPosition | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setInfo(null);
        setTmdb(null);
        void (async () => {
            const vi = client ? await client.getVodInfo(movie.stream_id) : null;
            if (!active) return;
            setInfo(vi);
            setLoading(false);
            if (!tmdbReady()) return;
            const tid = vi?.info?.tmdb_id ?? movie.tmdb_id;
            if (tid) {
                const t = await tmdbMovie(tid);
                if (active) setTmdb(t);
            }
        })();
        return () => { active = false; };
    }, [client, movie]);

    const i = info?.info;
    const title = tmdb?.title || i?.name || movie.name;
    const logo = tmdbLogo(tmdb);
    const backdrop = tmdbImage(tmdb?.backdrop_path, 'w1280') ?? i?.backdrop_path?.[0] ?? null;
    const poster = tmdbImage(tmdb?.poster_path, 'w342') ?? i?.movie_image ?? i?.cover_big ?? movie.stream_icon;
    const year = yearOf(tmdb?.release_date ?? i?.releasedate);
    const durationText = tmdb?.runtime
        ? t('{n} dk', { n: tmdb.runtime })
        : i?.duration_secs
          ? fmtMinutes(i.duration_secs)
          : (i?.duration ?? '');
    const genre = tmdb?.genres?.map((g) => g.name).join(', ') || i?.genre || '';
    const ratingNum = tmdb?.vote_average || Number(i?.rating) || Number(movie.rating) || 0;
    const plot = tmdb?.overview || i?.plot || i?.description || '';
    const actors =
        tmdb?.credits?.cast?.slice(0, 6).map((c) => c.name).join(', ') ||
        i?.actors || i?.cast || '';
    const director = tmdb?.credits?.crew?.find((c) => c.job === 'Director')?.name || i?.director || '';
    const trailer = youtubeTrailerKey(tmdb) ?? (i?.youtube_trailer?.trim() || null);

    const positionKey = `vod:${movie.stream_id}`;
    const ext = info?.movie_data?.container_extension || movie.container_extension || 'mp4';
    const playUrl = client ? client.vodUrl(movie.stream_id, ext) : '';

    const startPlay = useCallback((startAt?: number) => {
        useContentStore.getState().addRecent('vod', String(movie.stream_id), movie.name, movie.stream_icon);
        setAskContinue(null);
        setPlayback({ startAt });
    }, [movie]);

    const onWatch = () => {
        const pos = useContentStore.getState().getPosition(positionKey);
        if (pos && pos.positionSecs > 10 && (pos.durationSecs <= 0 || pos.positionSecs / pos.durationSecs < 0.97))
            setAskContinue(pos);
        else startPlay();
    };

    const refocusWatch = () => window.setTimeout(() => focusKey('detail-watch'), 60);

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

            {/* Meta: Yıl • Tür • Süre • HD • IMDb */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20, fontSize: 15, color: 'rgba(255,255,255,0.75)' }}>
                {year && <span style={{ fontWeight: 700, color: '#fff' }}>{year}</span>}
                {durationText && <><span style={{ opacity: 0.4 }}>•</span><span>{durationText}</span></>}
                {genre && <><span style={{ opacity: 0.4 }}>•</span><span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{genre}</span></>}
                <><span style={{ opacity: 0.4 }}>•</span>
                <span style={{ border: '1px solid rgba(255,255,255,0.45)', borderRadius: 4, padding: '1px 6px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>HD</span></>
                {ratingNum > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: '#F5C518', borderRadius: 4, padding: '1px 5px', fontSize: 11, fontWeight: 900, color: '#000' }}>IMDb</span>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{ratingNum.toFixed(1)}</span>
                    </div>
                )}
                {loading && <Spinner size={18} />}
            </div>

            {/* Özet (APK: max 6 satır) */}
            {plot && (
                <div className="line-clamp-6" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.6, marginBottom: 14, maxWidth: '90%' }}>
                    {plot}
                </div>
            )}

            {/* Oyuncu / Yönetmen satırları */}
            {actors && (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                    <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{t('Oyuncu kadrosu: ')}</span>{actors}
                </div>
            )}
            {director && (
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
                    <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{t('Yönetmen: ')}</span>{director}
                </div>
            )}

            {/* Aksiyon butonları (APK: yatay Row, pill shape) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 40 }}>
                <GlassButton primary label={t('ŞİMDİ İZLE')} icon={<span>▶</span>} onClick={onWatch} autoFocus focusKey="detail-watch" />
                <GlassButton
                    label={isFav ? t('FAVORİDEN ÇIKAR') : t('FAVORİ EKLE')}
                    icon={<span style={{ fontSize: 16 }}>{isFav ? '❤️' : '🤍'}</span>}
                    onClick={() => useContentStore.getState().toggleFavorite('vod', movie.stream_id)}
                />
                {trailer && <GlassButton label={t('FRAGMAN')} icon={<span>🎞️</span>} onClick={openTrailer} />}
            </div>

            {/* Oyuncu Kadrosu şeridi (APK: LazyRow cast) */}
            {tmdb?.credits?.cast && tmdb.credits.cast.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{t('Oyuncu Kadrosu')}</div>
                    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                        {tmdb.credits.cast.slice(0, 15).map((actor) => (
                            <div key={actor.name} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 90 }}>
                                <div style={{ width: 80, height: 108, borderRadius: 10, overflow: 'hidden', background: '#0d1322', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 6 }}>
                                    {actor.profile_path ? (
                                        <img src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, opacity: 0.3 }}>👤</div>
                                    )}
                                </div>
                                <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{actor.name}</div>
                                {actor.character && <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{actor.character}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Fragman şeridi (APK: LazyRow trailers) */}
            {tmdb?.videos?.results && tmdb.videos.results.filter(v => v.type === 'Trailer' || v.type === 'Teaser').length > 0 && (
                <div style={{ marginBottom: 32 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{t('Fragmanlar')}</div>
                    <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
                        {tmdb.videos.results.filter(v => v.type === 'Trailer' || v.type === 'Teaser').slice(0, 8).map((vid) => (
                            <div
                                key={vid.key}
                                style={{ flexShrink: 0, width: 200, cursor: 'pointer' }}
                                onClick={() => void window.osplayer.app.openExternal(`https://www.youtube.com/watch?v=${vid.key}`)}
                            >
                                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', background: '#0d1322', marginBottom: 6 }}>
                                    <img src={`https://img.youtube.com/vi/${vid.key}/hqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20 }}>▶</div>
                                    </div>
                                </div>
                                <div style={{ color: '#fff', fontSize: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{vid.name || t('Fragman')}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {askContinue && (
                <ContinueModal
                    title={title}
                    positionSecs={askContinue.positionSecs}
                    onContinue={() => startPlay(askContinue.positionSecs)}
                    onRestart={() => startPlay(0)}
                    onCancel={() => { setAskContinue(null); refocusWatch(); }}
                />
            )}
            {playback && (
                <VodPlayer
                    title={title}
                    url={playUrl}
                    positionKey={positionKey}
                    startAt={playback.startAt}
                    onExit={() => { setPlayback(null); refocusWatch(); }}
                />
            )}
        </DetailPanel>
    );
}

// ---- Ekran -------------------------------------------------------------------

export default function MoviesScreen() {
    const route = useCurrentRoute();
    const movieId = route.params?.movieId != null ? Number(route.params.movieId) : undefined;

    return (
        <VodBrowser<Movie>
            kind="vod"
            placeholder="🎬"
            getId={getId}
            getName={getName}
            getImage={getImage}
            getRating={getRating}
            getAdded={getAdded}
            getCategoryId={getCategoryId}
            getPositionKey={getPositionKey}
            loadItems={loadItems}
            initialItemId={movieId}
            renderDetail={(movie, close) => <MovieDetail movie={movie} onClose={close} />}
        />
    );
}
