/** Veri modelleri — Android APK (com.os.player.data.models) ile birebir uyumlu */

export interface Account {
    accountName?: string;
    username: string;
    password: string;
    serverUrl?: string; // boşsa panel config api_url kullanılır
    displayName?: string;
    imageUrl?: string;
    isActive?: boolean;
    isManual?: boolean; // manuel eklenen vs panelden gelen (online) hesap
    isFreeM3u?: boolean; // Şifresiz M3U linki
}

export interface AppNotification {
    id: string;
    title: string;
    msg: string;
    date: string;
    read?: boolean;
}

export interface UserInfo {
    username?: string;
    password?: string;
    message?: string;
    auth?: number;
    status?: string; // "Active"
    exp_date?: string | null; // epoch saniye
    is_trial?: string;
    active_cons?: string | number;
    created_at?: string;
    max_connections?: string | number;
    allowed_output_formats?: string[];
}

export interface ServerInfo {
    url?: string;
    port?: string;
    https_port?: string;
    server_protocol?: string;
    rtmp_port?: string;
    timezone?: string;
    timestamp_now?: number;
    time_now?: string;
}

export interface LoginResponse {
    user_info?: UserInfo;
    server_info?: ServerInfo;
}

export interface Category {
    category_id: string;
    category_name: string;
    parent_id?: number;
}

export interface Channel {
    num?: number;
    name: string;
    stream_type?: string;
    stream_id: number | string;
    stream_icon?: string;
    epg_channel_id?: string | null;
    category_id?: string;
    tv_archive?: number;
    tv_archive_duration?: number;
    added?: string;
    direct_source?: string;
    custom_sid?: string | null;
}

export interface Movie {
    num?: number;
    name: string;
    stream_type?: string;
    stream_id: number;
    stream_icon?: string;
    rating?: string | number;
    rating_5based?: string | number;
    category_id?: string;
    container_extension?: string;
    added?: string;
    tmdb_id?: string | number;
}

export interface Series {
    num?: number;
    name: string;
    series_id: number;
    cover?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    release_date?: string;
    rating?: string | number;
    rating_5based?: string | number;
    backdrop_path?: string[];
    youtube_trailer?: string;
    episode_run_time?: string;
    category_id?: string;
    tmdb_id?: string | number;
    tmdb?: string | number; // bazı paneller diziler için bu adı kullanır
}

export interface VodInfo {
    info?: {
        tmdb_id?: string | number;
        name?: string;
        o_name?: string;
        cover_big?: string;
        movie_image?: string;
        releasedate?: string;
        youtube_trailer?: string;
        director?: string;
        actors?: string;
        cast?: string;
        description?: string;
        plot?: string;
        age?: string;
        rating?: string | number;
        duration_secs?: number;
        duration?: string;
        backdrop_path?: string[];
        genre?: string;
    };
    movie_data?: {
        stream_id?: number;
        name?: string;
        container_extension?: string;
        category_id?: string;
    };
}

export interface SeriesEpisode {
    id: string;
    episode_num: number | string;
    title?: string;
    container_extension?: string;
    season?: number;
    info?: {
        movie_image?: string;
        plot?: string;
        description?: string; // bazı paneller plot yerine description döner
        duration?: string;
        rating?: string | number;
        releasedate?: string;
    };
}

export interface SeriesInfo {
    seasons?: Array<{
        season_number?: number;
        name?: string;
        episode_count?: number | string;
        cover?: string;
        overview?: string;
        air_date?: string;
    }>;
    info?: {
        name?: string;
        cover?: string;
        plot?: string;
        cast?: string;
        director?: string;
        genre?: string;
        releaseDate?: string;
        rating?: string | number;
        backdrop_path?: string[];
        youtube_trailer?: string;
        episode_run_time?: string;
        tmdb_id?: string | number;
        tmdb?: string | number; // bazı paneller diziler için bu adı kullanır
    };
    episodes?: Record<string, SeriesEpisode[]>; // sezon no -> bölümler
}

export interface EpgListing {
    id?: string;
    epg_id?: string;
    title?: string; // base64
    start?: string;
    end?: string;
    description?: string; // base64
    start_timestamp?: string | number;
    stop_timestamp?: string | number;
    now_playing?: number;
}

export interface PanelConfig {
    app_name?: string;
    logo_url?: string;
    api_url?: string;
    fallback_urls?: string[];
    tmdb_api_key?: string;
    tmdb_language?: string;
    latest_version?: string;
    latest_apk?: string;
    announcement?: string;
    weather_api_key?: string; // WeatherAPI.com API key (panelden gelir)
    [key: string]: unknown;
}

/** İzleme konumu (kaldığın yer) */
export interface PlaybackPosition {
    key: string; // vod:<streamId> | series:<episodeId>
    positionSecs: number;
    durationSecs: number;
    updatedAt: number;
    name?: string;
}

export interface AppSettings {
    uiScale: number; // 0.5 - 2.0
    language: string; // 'tr' | 'en' | ...
    parentalPin: string | null;
    parentalProtectSettings: boolean;
    parentalProtectEdit: boolean;
    lastUpdateCheck?: number;
    videoPlayer: 'html5' | 'mpv';
    weatherApiKey?: string;    // Manuel API key (panelden gelmezse fallback)
    recentlyAddedLimit: number;   // Son eklenenler limiti (Filmler & Diziler)
    recentlyWatchedLimit: number; // Son izlenenler limiti (Canlı TV, Filmler & Diziler)
    useTmdb: boolean;             // TMDB'den verileri al (pasifse yalnızca Xtream API)
    tmdbLanguage: string;         // TMDB veri dili (ilk tercih; bilgi yoksa İngilizce fallback)
}

export const DEFAULT_SETTINGS: AppSettings = {
    uiScale: 1,
    language: 'tr',
    parentalPin: '0000',
    parentalProtectSettings: false,
    parentalProtectEdit: false,
    videoPlayer: 'mpv',
    recentlyAddedLimit: 20,
    recentlyWatchedLimit: 20,
    useTmdb: true,
    tmdbLanguage: 'tr',
};

/** Overlay (oynatıcı üstü) durum modeli — mainWindow üretir, overlay penceresi çizer */
export interface OverlayMenuState {
    title: string;
    items: Array<{ label: string; selected?: boolean; active?: boolean }>;
    focusedIndex: number;
}

export interface OverlayState {
    volume?: number;
    muted?: boolean;
    visible: boolean;
    mode: 'live' | 'vod';
    title: string;
    subtitle?: string;
    epgNow?: string;
    epgNext?: string;
    paused: boolean;
    buffering: boolean;
    positionSecs: number;
    durationSecs: number;
    showInfoBar: boolean;
    showControls: boolean;
    focusedControl?: string;
    menu: OverlayMenuState | null;
    channelNumberInput?: string;
    errorText?: string;
    // Canlı info bar (ornek paritesi)
    logo?: string;
    quality?: string;
    channelIndex?: number;
    // VOD kontrol bar (ornek paritesi)
    hasChapters?: boolean;
    hasNext?: boolean;
}

/** Paylaşılan video katmanlarının görünüm sözleşmeleri. */
export interface LiveOverlayUi {
 visible:boolean;buffering:boolean;errorText:string|null;fullscreen:boolean;showInfoBar:boolean;
 channelName:string;channelIcon?:string;channelIndex:number;quality?:string;numInput?:string;epgNow?:string;epgNext?:string;
}
export interface VodOverlayUi {
 visible:boolean;buffering:boolean;errorText:string|null;controlsVisible:boolean;paused:boolean;title:string;
 displayTimeSecs:number;durationSecs:number;progressPercent:number;seekFocused:boolean;focused:string;
 showChaptersBtn:boolean;showNextBtn:boolean;
 menu:null|{width:number;title:string;index:number;items:Array<{label:string;active?:boolean}>};
 autoNext:null|{countdown:number;focus:string};
}
