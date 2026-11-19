import { useAppearance } from './lib/appearance';
import React, { useEffect } from 'react';
import { useAppStore, useCurrentRoute } from './store/appStore';
import SplashScreen from './screens/Splash';
import LoginScreen from './screens/Login';
import AccountManagerScreen from './screens/AccountManager';
import DashboardScreen from './screens/Dashboard';
import LiveTvScreen from './screens/LiveTv';
import MoviesScreen from './screens/Movies';
import SeriesScreen from './screens/Series';
import SearchScreen from './screens/Search';
import SettingsScreen from './screens/Settings';
import ProfileScreen from './screens/Profile';
import { focusFirst } from './nav/spatial';
import { SyncOverlay, BlockedScreen } from './components/common';
import { isBlockedStatus } from './lib/panel';

export default function App() {
    const appearance = useAppearance();
    useEffect(() => {
        document.documentElement.dataset.theme = appearance.theme;
        document.documentElement.style.setProperty('--desktop-wallpaper', appearance.wallpaper ? `url("${appearance.wallpaper}")` : 'none');
    }, [appearance.theme, appearance.wallpaper]);
    const route = useCurrentRoute();
    const back = useAppStore((s) => s.back);
    const init = useAppStore((s) => s.init);
    const uiScale = useAppStore((s) => s.settings.uiScale);
    const syncOverlay = useAppStore((s) => s.syncOverlay);
    const deviceStatus = useAppStore((s) => s.deviceStatus);
    const checkDeviceStatus = useAppStore((s) => s.checkDeviceStatus);
    const blocked = isBlockedStatus(deviceStatus);

    useEffect(() => {
        void init();
    }, [init]);

    // Geri tuşu (Escape/Backspace) — ekranlar kendi içinde dialog kapatıyorsa
    // event'i kendileri tüketir; buraya düşerse route yığınından çıkılır
    useEffect(() => {
        const handler = () => {
            // Açık odak katmanı (modal) varsa ekran bileşeni yönetir
            if (document.querySelector('[data-focus-layer]')) return;
            back();
        };
        window.addEventListener('app-back', handler);
        return () => window.removeEventListener('app-back', handler);
    }, [back]);

    // Arayüz ölçeklendirme ayarı
    useEffect(() => {
        if (window.osplayer) void window.osplayer.app.setZoom(uiScale);
    }, [uiScale]);

    // Ekran değişince ilk odağı kur
    useEffect(() => {
        const t = setTimeout(() => focusFirst(), 80);
        return () => clearTimeout(t);
    }, [route.name]);

    // IPC dinleyicileri (Overlay'den gelen komutlar)
    useEffect(() => {
        if (!window.osplayer?.onEvent) return;
        const offPoke = window.osplayer.onEvent('player:poke', () => {
            window.dispatchEvent(new Event('player-poke'));
        });
        const offExit = window.osplayer.onEvent('player:exit-fullscreen', () => {
            window.dispatchEvent(new Event('app-back'));
        });
        return () => {
            offPoke();
            offExit();
        };
    }, []);

    useEffect(() => {
        window.osplayer?.advertising.context({screen: !blocked && route.name === 'dashboard' ? 'home' : 'none', fullscreen:false, controls:true});
    }, [route.name, blocked]);

    const renderScreen = () => {
        switch (route.name) {
            case 'splash':
                return <SplashScreen />;
            case 'login':
                return <LoginScreen />;
            case 'accounts':
                return <AccountManagerScreen />;
            case 'dashboard':
                return <DashboardScreen />;
            case 'live':
                return <LiveTvScreen />;
            case 'movies':
                return <MoviesScreen />;
            case 'series':
                return <SeriesScreen />;
            case 'search':
                return <SearchScreen />;
            case 'settings':
                return <SettingsScreen />;
            case 'profile':
                return <ProfileScreen />;
            default:
                return <SplashScreen />;
        }
    };

    return (
        <>
            {renderScreen()}
            {syncOverlay.show && <SyncOverlay message={syncOverlay.message} />}
            {blocked && <BlockedScreen status={deviceStatus} onRecheck={checkDeviceStatus} />}
        </>
    );
}
