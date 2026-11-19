import { contextBridge, ipcRenderer } from 'electron';

/**
 * Renderer'a açılan güvenli API: window.osplayer
 * Faz 1: SQLite gelişmiş API eklendi (db.*)
 * Faz 2: MPV --wid embed — player API aynı kalır
 */
const api = {
    advertising: {
        context: (state: unknown) => ipcRenderer.send('advertising:context', state),
        ready: () => ipcRenderer.send('advertising:ready'),
        action: (state: string) => ipcRenderer.send('advertising:action', state),
    },
    http: {
        request: (req: {
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: string;
            responseType?: 'json' | 'text';
            timeoutMs?: number;
        }) => ipcRenderer.invoke('http:request', req),
    },
    store: {
        get: (key: string) => ipcRenderer.invoke('store:get', key),
        set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
        delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    },
    /** Gelişmiş SQLite API — tip güvenli, ilişkisel */
    db: {
        getFavorites: (accountKey: string) =>
            ipcRenderer.invoke('db:getFavorites', accountKey) as Promise<{ stream_id: string; stream_type: string; added_at: number }[]>,
        isFavorite: (accountKey: string, streamId: string, streamType: string) =>
            ipcRenderer.invoke('db:isFavorite', accountKey, streamId, streamType) as Promise<boolean>,
        addFavorite: (accountKey: string, streamId: string, streamType: string) =>
            ipcRenderer.invoke('db:addFavorite', accountKey, streamId, streamType) as Promise<void>,
        removeFavorite: (accountKey: string, streamId: string, streamType: string) =>
            ipcRenderer.invoke('db:removeFavorite', accountKey, streamId, streamType) as Promise<void>,
        getWatchPosition: (accountKey: string, streamId: string) =>
            ipcRenderer.invoke('db:getWatchPosition', accountKey, streamId) as Promise<{ position: number; duration: number } | null>,
        setWatchPosition: (accountKey: string, streamId: string, position: number, duration: number) =>
            ipcRenderer.invoke('db:setWatchPosition', accountKey, streamId, position, duration) as Promise<void>,
        getHiddenChannels: (accountKey: string) =>
            ipcRenderer.invoke('db:getHiddenChannels', accountKey) as Promise<string[]>,
        addHiddenChannel: (accountKey: string, streamId: string) =>
            ipcRenderer.invoke('db:addHiddenChannel', accountKey, streamId) as Promise<void>,
        removeHiddenChannel: (accountKey: string, streamId: string) =>
            ipcRenderer.invoke('db:removeHiddenChannel', accountKey, streamId) as Promise<void>,
    },
    device: {
        info: () => ipcRenderer.invoke('device:info'),
    },
    app: {
        version: () => ipcRenderer.invoke('app:version'),
        quit: () => ipcRenderer.invoke('app:quit'),
        toggleFullscreen: () => ipcRenderer.invoke('app:toggle-fullscreen'),
        openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
        clearCache: () => ipcRenderer.invoke('app:clear-cache'),
        setZoom: (factor: number) => ipcRenderer.invoke('app:zoom', factor),
    },
    player: {
        setBounds: (rect: { x: number; y: number; width: number; height: number }) =>
            ipcRenderer.invoke('player:set-bounds', rect),
        show: () => ipcRenderer.invoke('player:show'),
        hide: () => ipcRenderer.invoke('player:hide'),
        poke: () => ipcRenderer.send('player:poke'),
        exitFullscreen: () => ipcRenderer.send('player:exit-fullscreen'),
    },
    mpv: {
        load: (url: string) => ipcRenderer.invoke('mpv:load', url),
        stop: () => ipcRenderer.invoke('mpv:stop'),
        command: (cmd: unknown[]) => ipcRenderer.invoke('mpv:command', cmd),
        onEvent: (cb: (ev: unknown) => void) => {
            const handler = (_e: unknown, ev: unknown) => cb(ev);
            ipcRenderer.on('mpv:event', handler as never);
            return () => ipcRenderer.removeListener('mpv:event', handler as never);
        },
    },
    overlay: {
        update: (state: unknown) => ipcRenderer.send('overlay:update', state),
        // Overlay penceresindeki kontrol/menü tıklamaları → mainWindow oynatıcısına
        command: (payload: unknown) => ipcRenderer.send('overlay:command', payload),
        onState: (cb: (state: unknown) => void) => {
            const handler = (_e: unknown, state: unknown) => cb(state);
            ipcRenderer.on('overlay:state', handler as never);
            return () => ipcRenderer.removeListener('overlay:state', handler as never);
        },
    },
    onEvent: (channel: string, cb: (data: unknown) => void) => {
        const handler = (_e: unknown, data: unknown) => cb(data);
        ipcRenderer.on(channel, handler as never);
        return () => ipcRenderer.removeListener(channel, handler as never);
    },
};

contextBridge.exposeInMainWorld('osplayer', api);

export type OsPlayerApi = typeof api;
