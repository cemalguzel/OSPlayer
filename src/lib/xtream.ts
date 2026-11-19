import { httpJson } from './ipc';
import type {
    Category,
    Channel,
    EpgListing,
    LoginResponse,
    Movie,
    Series,
    SeriesInfo,
    VodInfo,
} from '../types';

/**
 * Xtream Codes API istemcisi (player_api.php) — APK XtreamApi.kt ile birebir.
 * Akış URL kuralları HomeRepository.kt'den taşındı:
 *   canlı : {base}/{user}/{pass}/{id}            (uzantısız varsayılan)
 *           {base}/live/{user}/{pass}/{id}.{ext} (uzantı belirtilirse)
 *   film  : {base}/movie/{user}/{pass}/{id}.{ext}   (vars. mp4)
 *   dizi  : {base}/series/{user}/{pass}/{id}.{ext}  (vars. mp4)
 */
export class XtreamClient {
    constructor(
        public baseUrl: string,
        private username: string,
        private password: string
    ) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    private api(params: Record<string, string>): string {
        const q = new URLSearchParams({
            username: this.username,
            password: this.password,
            ...params,
        });
        return `${this.baseUrl}/player_api.php?${q.toString()}`;
    }

    login(): Promise<LoginResponse | null> {
        return httpJson<LoginResponse>(this.api({}));
    }

    getLiveCategories(): Promise<Category[] | null> {
        return httpJson<Category[]>(this.api({ action: 'get_live_categories' }));
    }

    getVodCategories(): Promise<Category[] | null> {
        return httpJson<Category[]>(this.api({ action: 'get_vod_categories' }));
    }

    getSeriesCategories(): Promise<Category[] | null> {
        return httpJson<Category[]>(this.api({ action: 'get_series_categories' }));
    }

    /**
     * Tüm canlı yayın kanallarını çeker (kategorisiz).
     * IPTVNator pattern: sunucu kategori bazlı limit uygulasa bile
     * kategorisiz sorgu her zaman tam listeyi döndürür.
     * Client-side filtre contentStore içinde yapılır.
     */
    getLiveStreams(): Promise<Channel[] | null> {
        return httpJson<Channel[]>(this.api({ action: 'get_live_streams' }), undefined, 90_000);
    }

    /**
     * Tüm film listesini çeker (kategorisiz).
     * Büyük listeler (5000+) için 90s timeout.
     */
    getVodStreams(): Promise<Movie[] | null> {
        return httpJson<Movie[]>(this.api({ action: 'get_vod_streams' }), undefined, 90_000);
    }

    /**
     * Tüm dizi listesini çeker (kategorisiz).
     */
    getSeries(): Promise<Series[] | null> {
        return httpJson<Series[]>(this.api({ action: 'get_series' }), undefined, 90_000);
    }

    getVodInfo(vodId: string | number): Promise<VodInfo | null> {
        return httpJson<VodInfo>(this.api({ action: 'get_vod_info', vod_id: String(vodId) }));
    }

    getSeriesInfo(seriesId: string | number): Promise<SeriesInfo | null> {
        return httpJson<SeriesInfo>(this.api({ action: 'get_series_info', series_id: String(seriesId) }));
    }

    async getShortEpg(streamId: string | number, limit = 6): Promise<EpgListing[]> {
        const res = await httpJson<{ epg_listings?: EpgListing[] }>(
            this.api({ action: 'get_short_epg', stream_id: String(streamId), limit: String(limit) })
        );
        return res?.epg_listings ?? [];
    }

    async getEpgByDate(streamId: string | number): Promise<EpgListing[]> {
        const res = await httpJson<{ epg_listings?: EpgListing[] }>(
            this.api({ action: 'get_simple_data_table', stream_id: String(streamId) })
        );
        return res?.epg_listings ?? [];
    }

    // ---- Akış URL'leri ----
    liveUrl(streamId: string | number, extension = ''): string {
        const ext = extension.replace(/^\./, '');
        return ext
            ? `${this.baseUrl}/live/${this.username}/${this.password}/${streamId}.${ext}`
            : `${this.baseUrl}/${this.username}/${this.password}/${streamId}`;
    }

    vodUrl(streamId: string | number, extension = 'mp4'): string {
        const ext = extension.replace(/^\./, '');
        return ext
            ? `${this.baseUrl}/movie/${this.username}/${this.password}/${streamId}.${ext}`
            : `${this.baseUrl}/movie/${this.username}/${this.password}/${streamId}`;
    }

    seriesUrl(episodeId: string | number, extension = 'mp4'): string {
        const ext = extension.replace(/^\./, '');
        return ext
            ? `${this.baseUrl}/series/${this.username}/${this.password}/${episodeId}.${ext}`
            : `${this.baseUrl}/series/${this.username}/${this.password}/${episodeId}`;
    }
}

/** base64 EPG başlığını güvenli çöz */
export function decodeEpgText(s?: string): string {
    if (!s) return '';
    try {
        return decodeURIComponent(escape(atob(s)));
    } catch {
        return s;
    }
}
