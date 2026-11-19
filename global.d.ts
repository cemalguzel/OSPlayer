export {};

declare global {
    interface HttpResponse {
        ok: boolean;
        status: number;
        body: unknown;
        text?: string;
        error?: string;
    }

    interface WatchPosition {
        position: number;
        duration: number;
    }

    interface FavoriteRow {
        stream_id: string;
        stream_type: string;
        added_at: number;
    }

    interface OsPlayerBridge {
        advertising: {context:(state:unknown)=>void;ready:()=>void;action:(state:string)=>void};
        http: {
            request: (req: {
                url: string;
                method?: string;
                headers?: Record<string, string>;
                body?: string;
                responseType?: 'json' | 'text';
                timeoutMs?: number;
            }) => Promise<HttpResponse>;
        };
        store: {
            get: (key: string) => Promise<unknown>;
            set: (key: string, value: unknown) => Promise<void>;
            delete: (key: string) => Promise<void>;
        };
        /** Gelişmiş SQLite API — tip güvenli */
        db: {
            getFavorites: (accountKey: string) => Promise<FavoriteRow[]>;
            isFavorite: (accountKey: string, streamId: string, streamType: string) => Promise<boolean>;
            addFavorite: (accountKey: string, streamId: string, streamType: string) => Promise<void>;
            removeFavorite: (accountKey: string, streamId: string, streamType: string) => Promise<void>;
            getWatchPosition: (accountKey: string, streamId: string) => Promise<WatchPosition | null>;
            setWatchPosition: (accountKey: string, streamId: string, position: number, duration: number) => Promise<void>;
            getHiddenChannels: (accountKey: string) => Promise<string[]>;
            addHiddenChannel: (accountKey: string, streamId: string) => Promise<void>;
            removeHiddenChannel: (accountKey: string, streamId: string) => Promise<void>;
        };
        device: {
            info: () => Promise<{
                deviceId: string;
                deviceKey: string;
                mac: string;
                model: string;
                platform: string;
                osVersion: string;
            }>;
        };
        app: {
            version: () => Promise<string>;
            quit: () => Promise<void>;
            toggleFullscreen: () => Promise<boolean>;
            openExternal: (url: string) => Promise<void>;
            clearCache: () => Promise<boolean>;
            setZoom: (factor: number) => Promise<number>;
        };
        player: {
            setBounds: (rect: { x: number; y: number; width: number; height: number }) => Promise<void>;
            show: () => Promise<void>;
            hide: () => Promise<void>;
            poke: () => void;
            exitFullscreen: () => void;
        };
        mpv: {
            load: (url: string) => Promise<void>;
            stop: () => Promise<void>;
            command: (cmd: unknown[]) => Promise<unknown>;
            onEvent: (cb: (ev: unknown) => void) => () => void;
        };
        overlay: {
            command: (payload: unknown) => void;
            update: (state: unknown) => void;
            onState: (cb: (state: unknown) => void) => () => void;
        };
        onEvent: (channel: string, cb: (data: unknown) => void) => () => void;
    }

    interface Window {
        osplayer: OsPlayerBridge;
    }
}
