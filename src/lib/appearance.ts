import { useEffect as ReactUseEffect, useSyncExternalStore } from 'react';
export type Theme = 'navy' | 'red' | 'colorful';
const EVENT = 'appearance-change';
export function getTheme(): Theme { const value = localStorage.getItem('desktop-theme'); return value === 'red' || value === 'colorful' ? value : 'navy'; }
export function getWallpaper() { return localStorage.getItem('desktop-wallpaper') || ''; }
const subscribe = (notify: () => void) => { window.addEventListener(EVENT, notify); window.addEventListener('storage', notify); return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', notify); }; };
export function useAppearance() { return { theme: useSyncExternalStore(subscribe, getTheme), wallpaper: useSyncExternalStore(subscribe, getWallpaper) }; }
export function setTheme(theme: Theme) { localStorage.setItem('desktop-theme', theme); const file = theme === 'red' ? 'back113.jpg' : theme === 'colorful' ? 'back120.png' : 'navy-solid.svg'; const selected = wallpapers.find(item => item.file === file); if (selected) localStorage.setItem('desktop-wallpaper', selected.url); window.dispatchEvent(new Event(EVENT)); }
export function setWallpaper(value: string) { if (value) localStorage.setItem('desktop-wallpaper', value); else localStorage.removeItem('desktop-wallpaper'); window.dispatchEvent(new Event(EVENT)); }

const bundledWallpapers = import.meta.glob('../assets/wallpapers/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const wallpapers = Object.entries(bundledWallpapers).sort(([a], [b]) => a.localeCompare(b)).map(([path, url], i) => ({ url, name: path.endsWith('navy-solid.svg') ? 'Sade Lacivert' : `Arka plan ${i + 1}`, file: path.split('/').pop()! }));
export function AppearanceSync() {
    const { theme, wallpaper } = useAppearance();
    ReactUseEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.setProperty('--desktop-wallpaper', wallpaper ? `url("${wallpaper}")` : 'none');
    }, [theme, wallpaper]);
    return null;
}
