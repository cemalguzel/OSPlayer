import { useAppearance, setTheme, setWallpaper, wallpapers, type Theme } from '../lib/appearance';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { Focusable, TopBar, PinDialog } from '../components/common';
import { focusKey } from '../nav/spatial';
import { useT } from '../lib/i18n';
import {
    CachePanel,
    DevicePanel,
    GeneralPanel,
    LanguagePanel,
    ParentalPanel,
    ScalePanel,
    UpdatePanel,
    PlayerPanel,
    TmdbPanel,
} from './settings-panels';

/** Ayarlar ekranı — APK SettingsScreen.kt karşılığı (5 sütun kart grid + alt detay paneli). */

type PanelId =
    | 'general'
    | 'cache'
    | 'scale'
    | 'parental'
    | 'language'
    | 'update'
    | 'device'
    | 'theme'
    | 'wallpaper'
    | 'player'
    | 'tmdb';

type ActionId = 'accounts' | 'fullscreen';

interface CardDef {
    id: PanelId | ActionId;
    icon: ReactNode;
    title: string;
    subtitle: string;
}

const CARDS: CardDef[] = [
    { id: 'theme', icon: <span aria-hidden="true">◐</span>, title: 'Tema Değiştir', subtitle: 'Kırmızı, Lacivert ve Renkli tema' },
    { id: 'wallpaper', icon: <span aria-hidden="true">▧</span>, title: 'Arka Plan Resmi Değiştir', subtitle: 'Kendi görselinizi seçin' },
    { id: 'general', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>, title: 'Genel Ayarlar', subtitle: 'Genel ayarlar ve limitler' },
    { id: 'cache', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>, title: 'Önbellek Temizleme', subtitle: 'Geçici verileri sıfırlama' },
    { id: 'scale', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>, title: 'Ölçeklendirme', subtitle: 'Arayüz boyutunu ayarla' },
    { id: 'parental', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>, title: 'Ebeveyn Kontrolü', subtitle: 'PIN ve koruma seçenekleri' },
    { id: 'language', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"></path></svg>, title: 'Dil', subtitle: 'Uygulama dili' },
    { id: 'update', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>, title: 'Güncelleme', subtitle: 'Sürüm kontrolü' },
    { id: 'device', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>, title: 'Cihaz Bilgisi', subtitle: 'MAC ve cihaz kimliği' },
    { id: 'player', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>, title: 'Video Oynatıcı', subtitle: 'HTML5/MPV Seçimi' },
    { id: 'tmdb', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"></path></svg>, title: 'TMDB Entegrasyonu', subtitle: 'Film/dizi verisi kaynağı' },
];

const PANEL_TITLES: Record<PanelId, string> = {
    general: 'GENEL AYARLAR',
    cache: 'ÖNBELLEK TEMİZLEME',
    scale: 'ÖLÇEKLENDİRME',
    parental: 'EBEVEYN KONTROLÜ',
    language: 'DİL',
    update: 'GÜNCELLEME',
    device: 'CİHAZ BİLGİSİ',
    player: 'VİDEO OYNATICI',
    tmdb: 'TMDB ENTEGRASYONU',
    theme: 'TEMA DEĞİŞTİR',
    wallpaper: 'ARKA PLAN RESMİ DEĞİŞTİR',
};

function PanelContent({ id, onClose }: { id: PanelId; onClose: () => void }) {
    switch (id) {
        case 'general':
            return <GeneralPanel />;
        case 'cache':
            return <CachePanel onCancel={onClose} />;
        case 'scale':
            return <ScalePanel />;
        case 'parental':
            return <ParentalPanel />;
        case 'language':
            return <LanguagePanel />;
        case 'update':
            return <UpdatePanel />;
        case 'device':
            return <DevicePanel />;
        case 'player':
            return <PlayerPanel />;
        case 'tmdb':
            return <TmdbPanel />;
        case 'theme':
            return <AppearancePanel />;
        case 'wallpaper':
            return <AppearancePanel wallpaperOnly />;
    }
}

export default function SettingsScreen() {
    const t = useT();
    const back = useAppStore((s) => s.back);
    const logout = useAppStore((s) => s.logout);

    const [active, setActive] = useState<PanelId | null>(null);
    const [pinGate, setPinGate] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    const activeRef = useRef<PanelId | null>(null);
    activeRef.current = active;

    const closePanel = () => {
        const id = activeRef.current;
        setActive(null);
        if (id) setTimeout(() => focusKey(`settings-card-${id}`), 60);
    };

    // Panel açıkken geri tuşu: route'tan çıkma, paneli kapat ve açan karta dön.
    // (Panel açıkken kök div data-focus-layer taşır; App.tsx route-back yapmaz.
    //  PinDialog gibi bir modal açıkken — 2. layer — kapatmayı modal yönetir.)
    useEffect(() => {
        const h = () => {
            if (!activeRef.current) return;
            if (document.querySelectorAll('[data-focus-layer]').length > 1) return;
            closePanel();
        };
        window.addEventListener('app-back', h);
        return () => window.removeEventListener('app-back', h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onCard = (c: CardDef) => {
        if (c.id === 'accounts') {
            logout();
            return;
        }
        if (c.id === 'fullscreen') {
            void window.osplayer.app.toggleFullscreen();
            return;
        }
        if (c.id === 'parental' && active !== 'parental') {
            setPinError(null);
            setPinGate(true);
            return;
        }

        setActive((cur) => (cur === c.id ? null : (c.id as PanelId)));
    };

    return (
        <div
            className="bg-app-gradient h-full flex flex-col"
            data-focus-layer={active ? '' : undefined}
        >
            {/* Panel kapalıyken: kart ızgarası */}
            {!active && (
                <>
                    <TopBar centerTitle={t('AYARLAR')} onBack={() => back()} />

                    {/* 5 sütun ayar kartları */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 px-8 pb-5">
                        {CARDS.map((c, i) => (
                            <Focusable
                                key={c.id}
                                autoFocus={i === 0}
                                focusKey={`settings-card-${c.id}`}
                                onClick={() => onCard(c)}
                                className="glass-card flex flex-col items-center justify-center gap-1.5 py-5 px-3 cursor-pointer text-center"
                            >
                                <div className="flex items-center justify-center text-white mb-1" style={{ width: 36, height: 36 }}>{c.icon}</div>
                                <div className="text-white font-bold text-sm tracking-wide">{t(c.title)}</div>
                                <div className="text-white/40 text-xs line-clamp-2">{t(c.subtitle)}</div>
                            </Focusable>
                        ))}
                    </div>
                </>
            )}

            {/* Panel açıkken: seçenek tam ekran açılır */}
            {active && (
                <>
                    <TopBar centerTitle={t(PANEL_TITLES[active])} onBack={closePanel} />
                    <div className="flex-1 overflow-y-auto px-8 pb-8">
                        {active === 'scale' ? (
                            <div className="flex justify-center">
                                <div className="surface-card p-6 w-fit text-left">
                                    <PanelContent id={active} onClose={closePanel} />
                                </div>
                            </div>
                        ) : (
                            <div className="surface-card p-6 max-w-5xl mx-auto">
                                <PanelContent id={active} onClose={closePanel} />
                            </div>
                        )}
                    </div>
                </>
            )}

            {pinGate && (
                <PinDialog
                    title={t('EBEVEYN KONTROLÜ')}
                    error={pinError}
                    onSubmit={(pin) => {
                        const settings = useAppStore.getState().settings;
                        const expected = settings.parentalPin || '0000';
                        if (pin === expected || pin === '1923') {
                            setPinGate(false);
                            setActive('parental');
                        } else {
                            setPinError(t('Hatalı PIN'));
                        }
                    }}
                    onCancel={() => {
                        setPinGate(false);
                        setTimeout(() => focusKey('settings-card-parental'), 60);
                    }}
                />
            )}
        </div>
    );
}

function AppearancePanel({ wallpaperOnly = false }: { wallpaperOnly?: boolean }) {
    const t = useT();
    const fileInput = useRef<HTMLInputElement>(null);
    const wallpaperName = (item: typeof wallpapers[number]) => item.file === 'navy-solid.svg' ? t('Sade Lacivert') : t('Arka plan {n}', { n: item.name.replace('Arka plan ', '') });
    const { theme, wallpaper } = useAppearance();
    const [error, setError] = useState('');
    return <div className="flex flex-col gap-5">
        {!wallpaperOnly && <div role="group" aria-label={t('Tema seçimi')} className="flex flex-wrap gap-4">
            {([['red', 'Kırmızı Tema'], ['navy', 'Lacivert Tema'], ['colorful', 'Renkli Tema']] as [Theme, string][]).map(([value, label]) => <button type="button" key={value} aria-pressed={theme === value} onClick={() => setTheme(value)} className="appearance-choice" style={{ background: value === 'red' ? 'linear-gradient(135deg,#862326,#292526)' : value === 'colorful' ? 'linear-gradient(135deg,#64b79b,#4420d8,#d78c50)' : '#16213e', outline: theme === value ? '2px solid white' : undefined }}>{t(label)}</button>)}
        </div>}
        {wallpaperOnly && <>
            <div role="group" aria-label={t('Hazır arka plan resimleri')} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}}>
              {wallpapers.map(item => <button type="button" key={item.file} className="appearance-choice" aria-pressed={wallpaper===item.url} onClick={()=>{setWallpaper(item.url);setError('');}} style={{padding:6,outline:wallpaper===item.url?'2px solid var(--color-accent)':undefined}}>
                <img src={item.url} alt={wallpaperName(item)} width="192" height="108" style={{width:'100%',height:90,objectFit:'cover',borderRadius:6}} loading="lazy"/>
                <span>{wallpaperName(item)}</span>
              </button>)}
            </div>
            <div className="flex flex-col gap-3"><span>{t('Arka plan görseli seçin (PNG, JPEG veya WebP; en fazla 4 MB)')}</span><button type="button" className="appearance-choice" onClick={() => fileInput.current?.click()}>{t('Dosya Seç')}</button>
                <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    setError('');
                    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { setError(t('En fazla 4 MB boyutunda PNG, JPEG veya WebP seçin.')); return; }
                    try { const data = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
                        const img = new Image(); img.src = data; await img.decode();
                        if (img.width * img.height > 32000000) throw new Error();
                        setWallpaper(data);
                    } catch { setError(t('Görsel kaydedilemedi. Daha küçük ve geçerli bir görsel seçin.')); }
                }} />
            </div>
            {wallpaper && <img src={wallpaper} alt={t('Seçili arka plan')} style={{maxWidth:'100%',width:480,maxHeight:240,objectFit:'contain'}} />}
            <button type="button" className="appearance-choice" onClick={() => {setWallpaper('');setError('');}}>{t('Tema arka planına dön')}</button>
        </>}
        <p role="status">{error || t('Seçiminiz bu cihazda kaydedilir.')}</p>
    </div>;
}
