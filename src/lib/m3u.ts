import { httpJson, bridge } from './ipc';
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

export interface BaseClient {
    baseUrl: string;
    login(): Promise<LoginResponse | null>;
    getLiveCategories(): Promise<Category[] | null>;
    getVodCategories(): Promise<Category[] | null>;
    getSeriesCategories(): Promise<Category[] | null>;
    getLiveStreams(): Promise<Channel[] | null>;
    getVodStreams(): Promise<Movie[] | null>;
    getSeries(): Promise<Series[] | null>;
    getVodInfo(vodId: string | number): Promise<VodInfo | null>;
    getSeriesInfo(seriesId: string | number): Promise<SeriesInfo | null>;
    getShortEpg(streamId: string | number, limit?: number): Promise<EpgListing[]>;
    getEpgByDate(streamId: string | number): Promise<EpgListing[]>;

    liveUrl(streamId: string | number, extension?: string): string;
    vodUrl(streamId: string | number, extension?: string): string;
    seriesUrl(episodeId: string | number, extension?: string): string;
}

export class M3uClient implements BaseClient {
    public baseUrl: string;
    private categories: Category[] = [];
    private channels: Channel[] = [];
    private loaded = false;

    constructor(url: string) {
        this.baseUrl = url;
    }

    private async ensureLoaded() {
        if (this.loaded) return;
        
        try {
            const res = await bridge().http.request({
                url: this.baseUrl,
                responseType: 'text',
                timeoutMs: 30000
            });

            if (!res.ok || !res.body) {
                throw new Error('M3U indirme başarısız');
            }

            const lines = (res.body as string).split(/\r?\n/);
            const cats = new Map<string, string>(); // category_id -> category_name
            const chans: Channel[] = [];
            
            let currentExtinf: any = null;
            let streamCounter = 1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                if (line.startsWith('#EXTINF:')) {
                    // #EXTINF:-1 tvg-id="" tvg-logo="https://..." group-title="Haber",Kanal Adı
                    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
                    const groupMatch = line.match(/group-title="([^"]*)"/);
                    const nameParts = line.split(',');
                    const name = nameParts.length > 1 ? nameParts[nameParts.length - 1].trim() : `Kanal ${streamCounter}`;
                    
                    currentExtinf = {
                        name,
                        logo: logoMatch ? logoMatch[1] : '',
                        group: groupMatch ? groupMatch[1].trim() : 'Diğer',
                    };
                } else if (!line.startsWith('#')) {
                    // URL
                    if (currentExtinf) {
                        const groupId = btoa(encodeURIComponent(currentExtinf.group)).replace(/=/g, '');
                        if (!cats.has(groupId)) {
                            cats.set(groupId, currentExtinf.group);
                        }

                        // stream_id olarak direkt URL'yi kullanırsak Xtream ile aynı string altyapısına uyar.
                        // Ancak güvenli olması için base64 encode ediyoruz.
                        const streamId = streamCounter; // ID'yi sayısal yap, URL'i hafızada tutalım.
                        const b64Url = btoa(encodeURIComponent(line));

                        chans.push({
                            num: streamCounter,
                            name: currentExtinf.name,
                            stream_type: 'live',
                            stream_id: b64Url, // liveUrl içinde bunu çözeceğiz
                            stream_icon: currentExtinf.logo,
                            epg_channel_id: null,
                            added: '',
                            category_id: groupId,
                            custom_sid: null,
                            tv_archive: 0,
                            direct_source: '',
                            tv_archive_duration: 0
                        });
                        
                        streamCounter++;
                        currentExtinf = null;
                    }
                }
            }

            this.categories = Array.from(cats.entries()).map(([id, name]) => ({
                category_id: id,
                category_name: name,
                parent_id: 0
            }));
            this.channels = chans;
            this.loaded = true;
        } catch (e) {
            console.error('[M3uClient] Parse hatası:', e);
            throw e;
        }
    }

    async login(): Promise<LoginResponse | null> {
        await this.ensureLoaded();
        return {
            user_info: {
                username: 'M3U Kullanıcısı',
                password: '',
                message: 'Active',
                auth: 1,
                status: 'Active',
                exp_date: 'Unlimited',
                is_trial: '0',
                active_cons: '0',
                created_at: '',
                max_connections: '1',
                allowed_output_formats: []
            },
            server_info: {
                url: this.baseUrl,
                port: '80',
                https_port: '443',
                server_protocol: 'http',
                rtmp_port: '1935',
                timestamp_now: Date.now(),
                time_now: new Date().toISOString(),
                timezone: 'UTC'
            }
        };
    }

    async getLiveCategories(): Promise<Category[] | null> {
        await this.ensureLoaded();
        return this.categories;
    }

    async getVodCategories(): Promise<Category[] | null> {
        return [];
    }

    async getSeriesCategories(): Promise<Category[] | null> {
        return [];
    }

    async getLiveStreams(): Promise<Channel[] | null> {
        await this.ensureLoaded();
        return this.channels;
    }

    async getVodStreams(): Promise<Movie[] | null> {
        return [];
    }

    async getSeries(): Promise<Series[] | null> {
        return [];
    }

    async getVodInfo(vodId: string | number): Promise<VodInfo | null> {
        return null;
    }

    async getSeriesInfo(seriesId: string | number): Promise<SeriesInfo | null> {
        return null;
    }

    async getShortEpg(streamId: string | number, limit = 6): Promise<EpgListing[]> {
        return [];
    }

    async getEpgByDate(streamId: string | number): Promise<EpgListing[]> {
        return [];
    }

    liveUrl(streamId: string | number, extension = ''): string {
        try {
            return decodeURIComponent(atob(String(streamId)));
        } catch {
            return String(streamId);
        }
    }

    vodUrl(streamId: string | number, extension = 'mp4'): string {
        return '';
    }

    seriesUrl(episodeId: string | number, extension = 'mp4'): string {
        return '';
    }
}
