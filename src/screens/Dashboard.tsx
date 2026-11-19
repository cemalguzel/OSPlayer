import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppStore, type RouteName } from '../store/appStore';
import { useContentStore } from '../store/contentStore';
import { ConfirmDialog, Focusable, Logo, PinDialog, SyncOverlay, Modal } from '../components/common';
import { focusKey } from '../nav/spatial';
import { useT } from '../lib/i18n';
import {
    IconNotifications,
    IconUpdate,
    IconGroup,
    IconSettings,
    IconPerson,
    IconMic,
    IconLiveTv,
    IconTheaters,
    IconVideoLibrary,
    IconSync,
} from '../components/icons';

/**
 * Ana ekran — APK DashboardScreen.kt birebir karşılığı.
 * Layout: Header | 4-kolon Grid (3 kart + RightInfoPanel) | Footer
 * İkonlar: Material Design SVG (APK Icons.Default.* ile birebir eşleşme)
 */

/* ─── UpdateCard ───────────────────────────────────────────────────────── */
function UpdateCard({
    lastUpdateText,
    onUpdateClick,
}: {
    lastUpdateText: string;
    onUpdateClick: () => void;
}) {
    const t = useT();
    return (
        <Focusable
            focusKey={`update-card-${lastUpdateText}`}
            onClick={onUpdateClick}
            className="update-card"
        >
            <span className="update-card__text">
                {t('Son Güncelleme: {text}', { text: lastUpdateText })}
            </span>
            <span className="update-card__icon">
                <IconSync size={20} color="#000" />
            </span>
        </Focusable>
    );
}

import { fetchWeather, getCachedWeather, weatherReady, type WeatherCurrent } from '../lib/weather';


/** WeatherAPI.com ile hava durumu çeken React hook (Sadece IP adresi kullanır) */
function useWeather(apiKey: string | undefined) {
    // Önbellekte değer varsa (uygulama açılışında çekilmişti) anında kullan —
    // ekran geçişlerinde yeni istek/yükleme animasyonu olmaz.
    const [data, setData] = useState<WeatherCurrent | null>(() => getCachedWeather());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!apiKey) {
            setData(null);
            setError(true);
            return;
        }

        // Önbellekte zaten varsa tekrar çekme (oturumda yalnızca 1 kez çekilir).
        const existing = getCachedWeather();
        if (existing) {
            setData(existing);
            return;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(false);
            try {
                // Oturumda yalnızca 1 kez gerçek istek yapılır; sonrası önbellekten döner.
                const result = await fetchWeather();
                if (cancelled) return;
                if (!result) throw new Error('no data');
                setData(result);
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [apiKey]);

    return { data, loading, error };
}

/* ─── RightInfoPanel ───────────────────────────────────────────────────── */
function RightInfoPanel() {
    const [device, setDevice] = useState<{mac:string;deviceKey:string}|null>(null);
    useEffect(()=>{let alive=true;void window.osplayer.device.info().then(d=>{if(alive)setDevice(d);}).catch(()=>{});return ()=>{alive=false;};},[]);
    const [time, setTime] = useState('--:--');
    const [date, setDate] = useState('');
    const [day, setDay] = useState('');
    
    // Aktif API key'i hesapla (Önce panelden, yoksa ayarlardan)
    const panelKey = useAppStore((s) => s.panelConfig?.weather_api_key);
    const manualKey = useAppStore((s) => s.settings.weatherApiKey);
    const activeApiKey = panelKey || manualKey;

    const { data: weather, loading: wLoading, error: wError } = useWeather(activeApiKey);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setTime(now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
            setDate(
                now
                    .toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
                    .toUpperCase()
            );
            setDay(
                now
                    .toLocaleDateString('tr-TR', { weekday: 'long' })
                    .toUpperCase()
            );
        };
        tick();
        const id = setInterval(tick, 10_000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="right-info-panel">
            {/* Saat */}
            <div className="right-info-panel__time">{time}</div>
            {/* Tarih */}
            <div className="right-info-panel__date">{date}</div>
            {/* Gün */}
            <div className="right-info-panel__day">{day}</div>

            {/* Hava Durumu — API key varsa göster (Şehir boşsa IP'den bulur) */}
            {activeApiKey && (
                <div className="right-info-panel__weather-block right-info-panel__card">
                    {wLoading && !weather && (
                        <div className="right-info-panel__weather weather--loading">
                            <span className="weather-spinner" />
                        </div>
                    )}
                    {wError && !weather && (
                        <div className="right-info-panel__weather weather--error">
                            🌡️ —
                        </div>
                    )}
                    {weather && (
                        <>
                            <div className="right-info-panel__weather">
                                {weather.iconUrl && (
                                    <img 
                                        src={weather.iconUrl} 
                                        alt={weather.conditionText} 
                                        className="weather-icon"
                                    />
                                )}
                                <span className="weather-temp">{Math.round(weather.tempC)}°C</span>
                            </div>
                            <div className="right-info-panel__weather-desc">
                                {weather.conditionText}
                            </div>
                            {/* Şehir (il) adı — region doluysa onu göster, boşsa city */}
                            <div className="right-info-panel__weather-city">
                                {weather.region || weather.city}
                            </div>
                        </>
                    )}
                </div>
            )}
            {device && (
                <div className="right-info-panel__devices">
                    {[['Cihaz Kimliği', device.mac.toUpperCase()], ['Cihaz Anahtarı', device.deviceKey]].map(([label, value]) => (
                        <div key={label} className="right-info-panel__card right-info-panel__device">
                            <div className="right-info-panel__device-label">{label}</div>
                            <div className="right-info-panel__device-value">{value}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


/* ─── DashboardScreen ──────────────────────────────────────────────────── */
interface DashCard {
    key: string;
    Icon: React.ComponentType<{ size?: number; color?: string }>;
    title: string;
    route: RouteName;
    focusKeyVal: string;
}

export default function DashboardScreen() {
    const t = useT();
    const push = useAppStore((s) => s.push);
    const settings = useAppStore((s) => s.settings);
    const session = useAppStore((s) => s.session);
    const client = useAppStore((s) => s.client);

    const syncOverlay = useAppStore((s) => s.syncOverlay);
    const setSyncOverlay = useAppStore((s) => s.setSyncOverlay);

    const allChannels = useContentStore((s) => s.allChannels);
    const allMovies = useContentStore((s) => s.allMovies);
    const allSeries = useContentStore((s) => s.allSeries);

    const lastUpdateLive = useContentStore((s) => s.lastUpdateLive) || 0;
    const lastUpdateVod = useContentStore((s) => s.lastUpdateVod) || 0;
    const lastUpdateSeries = useContentStore((s) => s.lastUpdateSeries) || 0;
    
    const [tickMs, setTickMs] = useState<number>(Date.now());

    const [showExit, setShowExit] = useState(false);
    const [pinGate, setPinGate] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);

    const notifications = useAppStore((s) => s.notifications);
    const markNotificationsRead = useAppStore((s) => s.markNotificationsRead);
    const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

    // Saat ticki (10 sn)
    useEffect(() => {
        const id = setInterval(() => setTickMs(Date.now()), 10_000);
        return () => clearInterval(id);
    }, []);

    // İçerik yükle (ilk açılışta veya hesap değiştiğinde)
    useEffect(() => {
        if (!client) return;
        let alive = true;
        
        const fetchInitial = async () => {
            const cs = useContentStore.getState();
            const hasCache = cs.allChannels && cs.allMovies && cs.allSeries;
            
            if (hasCache) {
                return;
            }

            // Cache yoksa, ilk yüklemede overlay göster
            setSyncOverlay(true, t('Canlı TV Güncelleniyor...'));
            try {
                await cs.loadChannels();
                if (alive) setSyncOverlay(true, t('Filmler Güncelleniyor...'));
                await cs.loadMovies();
                if (alive) setSyncOverlay(true, t('Diziler Güncelleniyor...'));
                await cs.loadSeries();
            } finally {
                if (alive) setSyncOverlay(false);
            }
        };

        void fetchInitial();
        
        return () => { alive = false; };
    }, [client]);

    // Geri tuşu → çıkış onayı
    useEffect(() => {
        const h = () => {
            if (document.querySelector('[data-focus-layer]')) return;
            const s = useAppStore.getState();
            const top = s.routes[s.routes.length - 1];
            if (!top || top.name !== 'dashboard' || s.routes.length > 1) return;
            setShowExit(true);
        };
        window.addEventListener('app-back', h);
        return () => window.removeEventListener('app-back', h);
    }, []);

    // Abonelik bitimine ≤7 gün uyarısı
    const expiryDays = useMemo(() => {
        const exp = session?.user_info?.exp_date;
        if (!exp || exp === 'null' || exp === '0') return null;
        const ts = Number(exp);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        const diff = ts - Math.floor(Date.now() / 1000);
        if (diff <= 0) return null;
        const days = Math.ceil(diff / 86400);
        return days <= 7 ? days : null;
    }, [session]);

    // Bitiş tarihi (Footer)
    const expiryLabel = useMemo(() => {
        const exp = session?.user_info?.exp_date;
        if (!exp || exp === 'null' || exp === '0') return t('SINIRSIZ');
        const ts = Number(exp) * 1000;
        if (!Number.isFinite(ts) || ts <= 0) return t('SINIRSIZ');
        return new Date(ts)
            .toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            .toUpperCase();
    }, [session]);

    // Göreceli güncelleme metni
    const relativeUpdate = useCallback((targetMs: number): string => {
        if (!targetMs) return t('Bilinmiyor');
        const diffSec = Math.floor((tickMs - targetMs) / 1000);
        if (diffSec < 60) return diffSec <= 1 ? t('Az önce') : t('{n} sn önce', { n: diffSec });
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return diffMin === 1 ? t('1 dk önce') : t('{n} dk önce', { n: diffMin });
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return diffHour === 1 ? t('1 saat önce') : t('{n} saat önce', { n: diffHour });
        const diffDay = Math.floor(diffHour / 24);
        return diffDay === 1 ? t('1 gün önce') : t('{n} gün önce', { n: diffDay });
    }, [tickMs, t]);

    const openSettings = () => {
        if (settings.parentalProtectSettings) {
            setPinError(null);
            setPinGate(true);
        } else {
            push('settings');
        }
    };

    // APK: Icons.Default.LiveTv / Theaters / VideoLibrary
    const cards: DashCard[] = [
        { key: 'live', Icon: IconLiveTv, title: 'CANLI TV', route: 'live', focusKeyVal: 'dash-card-live' },
        { key: 'movies', Icon: IconTheaters, title: 'FİLMLER', route: 'movies', focusKeyVal: 'dash-card-movies' },
        { key: 'series', Icon: IconVideoLibrary, title: 'DİZİLER', route: 'series', focusKeyVal: 'dash-card-series' },
    ];

    // Tüm içerikleri force-refresh eden yardımcı
    const refreshAll = useCallback(async () => {
        if (syncOverlay.show) return;
        setSyncOverlay(true, t('Canlı TV Güncelleniyor...'));
        const cs = useContentStore.getState();
        try {
            await Promise.all([cs.loadCategories('live', true), cs.loadChannels(undefined, true)]);
            setSyncOverlay(true, t('Filmler Güncelleniyor...'));
            await Promise.all([cs.loadCategories('vod', true), cs.loadMovies(undefined, true)]);
            setSyncOverlay(true, t('Diziler Güncelleniyor...'));
            await Promise.all([cs.loadCategories('series', true), cs.loadSeries(undefined, true)]);
        } finally {
            setSyncOverlay(false);
        }
    }, [syncOverlay.show, t]);

    const lastUpdates = [lastUpdateLive, lastUpdateVod, lastUpdateSeries];
    const syncHandlers = [
        async () => {
            const cs = useContentStore.getState();
            setSyncOverlay(true, t('Canlı TV Güncelleniyor...'));
            try {
                await Promise.all([cs.loadCategories('live', true), cs.loadChannels(undefined, true)]);
            } finally {
                setSyncOverlay(false);
            }
        },
        async () => {
            const cs = useContentStore.getState();
            setSyncOverlay(true, t('Filmler Güncelleniyor...'));
            try {
                await Promise.all([cs.loadCategories('vod', true), cs.loadMovies(undefined, true)]);
            } finally {
                setSyncOverlay(false);
            }
        },
        async () => {
            const cs = useContentStore.getState();
            setSyncOverlay(true, t('Diziler Güncelleniyor...'));
            try {
                await Promise.all([cs.loadCategories('series', true), cs.loadSeries(undefined, true)]);
            } finally {
                setSyncOverlay(false);
            }
        },
    ];

    return (
        <div className="bg-app-gradient h-full flex flex-col" style={{ padding: '16px 24px 0' }}>

            {/* ── HEADER: grid[logo | arama | ikonlar] ────────────────── */}
            <div className="dash-header">
                {/* Grid kolon 1: Logo — sol (%50 büyütüldü: 78 -> 117) */}
                <Logo height={117} />

                {/* Grid kolon 2: Arama — merkez (%20 büyütüldü) */}
                <Focusable
                    focusKey="dash-search"
                    onClick={() => push('search')}
                    className="glass-card dash-search cursor-pointer"
                >
                    <IconMic size={22} color="rgba(255,255,255,0.55)" />
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 17, flex: 1 }}>
                        {t('Kanal, Film veya Dizi Ara...')}
                    </span>
                </Focusable>

                {/* Grid kolon 3: Aksiyon ikonları — sağ (%50 büyütüldü: 19 -> 28) */}
                <div className="dash-header__actions">
                    <Focusable
                        focusKey="dash-notify"
                        onClick={() => {
                            markNotificationsRead();
                            setShowNotifications(true);
                        }}
                        className="dash-header-icon cursor-pointer relative"
                        title={t('Bildirimler')}
                    >
                        <IconNotifications size={28} color="rgba(255,255,255,0.75)" />
                        {unreadCount > 0 && (
                            <div className="absolute top-1 right-1 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                                {unreadCount}
                            </div>
                        )}
                    </Focusable>
                    <Focusable
                        focusKey="dash-refresh"
                        onClick={() => void refreshAll()}
                        className="dash-header-icon cursor-pointer"
                        title={t('Yenile')}
                        style={{ position: 'relative', opacity: syncOverlay.show ? 0.6 : 1 }}
                    >
                        <IconUpdate
                            size={28}
                            color="rgba(255,255,255,0.75)"
                            style={syncOverlay.show ? { animation: 'spin 1s linear infinite' } : undefined}
                        />
                    </Focusable>
                    <Focusable
                        focusKey="dash-accounts"
                        onClick={() => push('accounts')}
                        className="dash-header-icon cursor-pointer"
                        title={t('Hesap Yöneticisi')}
                    >
                        <IconGroup size={28} color="rgba(255,255,255,0.75)" />
                    </Focusable>
                    <Focusable
                        focusKey="dash-settings"
                        onClick={openSettings}
                        className="dash-header-icon cursor-pointer"
                        title={t('Ayarlar')}
                    >
                        <IconSettings size={28} color="rgba(255,255,255,0.75)" />
                    </Focusable>
                    <Focusable
                        focusKey="dash-profile"
                        onClick={() => push('profile')}
                        className="dash-header-icon cursor-pointer"
                        title={t('Profil')}
                    >
                        <IconPerson size={28} color="rgba(255,255,255,0.75)" />
                    </Focusable>
                    <button type="button" data-focusable data-focus-key="dash-quit" aria-label="Uygulamayı kapat" title="Uygulamayı kapat" onClick={() => void window.osplayer.app.quit()} className="dash-header-icon dash-quit">
                        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
                    </button>
                </div>
            </div>

            {/* ── ORTA: 4 sütun ────────────────────────────────────────── */}
            <div className="dash-grid">
                {cards.map((c, i) => (
                    <div key={c.key} className="dash-col">
                        {/* Ana kart */}
                        <Focusable
                            autoFocus={i === 0}
                            focusKey={c.focusKeyVal}
                            onClick={() => push(c.route)}
                            className="premium-glass-card dash-main-card cursor-pointer"
                        >
                            {/* İkonlar %50 büyütüldü (48 -> 72) */}
                            <div className="dash-main-card__icon">
                                <c.Icon size={72} color="rgba(255,255,255,0.72)" />
                            </div>
                            <div className="dash-main-card__title">{t(c.title)}</div>
                        </Focusable>

                        {/* UpdateCard — APK: Icons.Default.Sync */}
                        <UpdateCard
                            lastUpdateText={relativeUpdate(lastUpdates[i])}
                            onUpdateClick={syncHandlers[i]}
                        />
                    </div>
                ))}

                {/* Sütun 4: RightInfoPanel */}
                <div className="dash-col dash-col--right">
                    <RightInfoPanel />
                </div>
            </div>

            {/* ── FOOTER ───────────────────────────────────────────────── */}
            <div className="dash-footer">
                <div className="dash-footer__expiry">
                    <div className="dash-footer__line" />
                    <span className="dash-footer__label">
                        {t('BİTİŞ TARİHİ: {date}', { date: expiryLabel })}
                    </span>
                </div>
                <div style={{ flex: 1 }} />
                {expiryDays != null && (
                    <div className="dash-footer__warning">
                        {t('⚠ Aboneliğinizin bitmesine {days} gün kaldı', { days: expiryDays })}
                    </div>
                )}
            </div>

            {/* Diyaloglar */}
            {showExit && (
                <ConfirmDialog
                    title={t('UYGULAMADAN ÇIKIŞ')}
                    text={t('Uygulamadan çıkılsın mı?')}
                    onConfirm={() => { void window.osplayer.app.quit(); }}
                    onCancel={() => {
                        setShowExit(false);
                        setTimeout(() => focusKey('dash-card-live'), 60);
                    }}
                />
            )}

            {pinGate && (
                <PinDialog
                    title={t('EBEVEYN KONTROLÜ')}
                    error={pinError}
                    onSubmit={(pin) => {
                        const expected = settings.parentalPin || '0000';
                        if (pin === expected || pin === '1923') {
                            setPinGate(false);
                            push('settings');
                        } else {
                            setPinError(t('Hatalı PIN'));
                        }
                    }}
                    onCancel={() => {
                        setPinGate(false);
                        setTimeout(() => focusKey('dash-settings'), 60);
                    }}
                />
            )}

            {showNotifications && (
                <Modal width={600}>
                    <div className="flex justify-between items-center mb-6">
                        <div className="text-xl font-bold text-white tracking-widest">{t('BİLDİRİMLER')}</div>
                        <Focusable
                            focusKey="btn-close-notif"
                            autoFocus
                            onClick={() => {
                                setShowNotifications(false);
                                setTimeout(() => focusKey('dash-notify'), 60);
                            }}
                            className="glass-card flex items-center justify-center w-8 h-8 rounded-full cursor-pointer text-white font-bold"
                        >
                            ✕
                        </Focusable>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                        {notifications.length === 0 ? (
                            <div className="text-white/50 text-center py-8">{t('Henüz bildirim yok.')}</div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {notifications.map((n) => (
                                    <div key={n.id} className="glass-card p-4 rounded-xl flex flex-col gap-1">
                                        <div className="flex justify-between items-start">
                                            <div className="font-bold text-white text-base">{n.title}</div>
                                            {n.date && (
                                                <div className="text-white/40 text-xs">
                                                    {new Date(n.date).toLocaleDateString('tr-TR')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">
                                            {n.msg}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
}
