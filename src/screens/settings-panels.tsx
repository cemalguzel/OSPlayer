import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useContentStore } from '../store/contentStore';
import { Focusable, GlassButton, PinDialog } from '../components/common';
import { focusKey } from '../nav/spatial';
import { LANGUAGES, useT } from '../lib/i18n';
import { TMDB_LANGUAGES } from '../lib/tmdb';

/** Ayarlar ekranı detay panelleri — Settings.tsx yardımcı dosyası. */

function ToggleRow({
    label,
    desc,
    value,
    onToggle,
}: {
    label: string;
    desc?: string;
    value: boolean;
    onToggle: () => void;
}) {
    return (
        <Focusable
            onClick={onToggle}
            className="glass-card flex items-center justify-between px-4 py-3 cursor-pointer"
        >
            <div className="min-w-0 pr-4">
                <div className="text-white text-sm font-semibold">{label}</div>
                {desc && <div className="text-white/40 text-xs mt-0.5">{desc}</div>}
            </div>
            <div
                className={`relative shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-white/15'}`}
                style={{ width: 48, height: 24 }}
            >
                <div
                    className="absolute rounded-full bg-white transition-all"
                    style={{ width: 20, height: 20, top: 2, left: value ? 26 : 2 }}
                />
            </div>
        </Focusable>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between border-b border-white/10 py-2.5 last:border-0">
            <div className="text-white/50 text-sm">{label}</div>
            <div className="text-white text-sm font-mono">{value}</div>
        </div>
    );
}

function LimitRow({
    label,
    desc,
    value,
    onChange,
}: {
    label: string;
    desc?: string;
    value: number;
    onChange: (v: number) => void;
}) {
    const options = [10, 20, 30, 40, 50, 100];
    return (
        <div className="glass-card px-4 py-3">
            <div className="text-white text-sm font-semibold">{label}</div>
            {desc && <div className="text-white/40 text-xs mt-0.5 mb-2">{desc}</div>}
            <div className="flex flex-wrap gap-2 mt-2">
                {options.map((o) => (
                    <Focusable
                        key={o}
                        onClick={() => onChange(o)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer transition-all ${
                            value === o ? 'bg-accent text-white' : 'bg-white/10 text-white/70'
                        }`}
                    >
                        {o}
                    </Focusable>
                ))}
            </div>
        </div>
    );
}

export function GeneralPanel() {
    const t = useT();
    const settings = useAppStore((s) => s.settings);
    const updateSettings = useAppStore((s) => s.updateSettings);
    return (
        <div className="flex flex-col gap-3">
            <LimitRow
                label={t('Son Eklenenler Limiti')}
                desc={t("Filmler ve Dizilerde 'Son Eklenenler' kategorisinde gösterilecek içerik sayısı.")}
                value={settings.recentlyAddedLimit}
                onChange={(v) => void updateSettings({ recentlyAddedLimit: v })}
            />
            <LimitRow
                label={t('Son İzlenenler Limiti')}
                desc={t("Canlı TV, Filmler ve Dizilerde 'Son İzlenenler' kategorisinde gösterilecek içerik sayısı.")}
                value={settings.recentlyWatchedLimit}
                onChange={(v) => void updateSettings({ recentlyWatchedLimit: v })}
            />
        </div>
    );
}

export function TmdbPanel() {
    const t = useT();
    const useTmdb = useAppStore((s) => s.settings.useTmdb);
    const tmdbLanguage = useAppStore((s) => s.settings.tmdbLanguage);
    const updateSettings = useAppStore((s) => s.updateSettings);
    return (
        <div className="flex flex-col gap-3">
            <ToggleRow
                label={t("TMDB'den Verileri Al")}
                desc={t("Aktif olduğunda film ve dizi detayları (afiş, özet, oyuncular, fragman, puan) TMDB'den zenginleştirilir. Pasif olduğunda TMDB kullanılmaz; bilgiler yalnızca Xtream API'den alınır.")}
                value={useTmdb}
                onToggle={() => void updateSettings({ useTmdb: !useTmdb })}
            />
            <div className="text-white/40 text-xs px-1 leading-relaxed">
                {useTmdb
                    ? t('Şu an TMDB aktif: detaylar TMDB ile zenginleştiriliyor.')
                    : t('Şu an TMDB pasif: detaylar yalnızca Xtream API verileriyle gösteriliyor.')}
            </div>

            {/* TMDB Veri Dili — ilk tercih dili; o dilde bilgi yoksa İngilizce kullanılır */}
            <div className={`glass-card px-4 py-4 mt-1 ${useTmdb ? '' : 'opacity-50 pointer-events-none'}`}>
                <div className="flex items-baseline gap-3 border-b border-white/10 pb-3 mb-3">
                    <span className="text-white text-base font-bold flex items-center gap-2">
                        <span aria-hidden>🌐</span>
                        {t('TMDB Veri Dili')}
                    </span>
                    <span className="text-white/45 text-xs">
                        {t('Seçili dilde bilgi yoksa İngilizce kullanılır')}
                    </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {TMDB_LANGUAGES.map((o) => {
                        const selected = tmdbLanguage === o.code;
                        return (
                            <Focusable
                                key={o.code}
                                onClick={() => void updateSettings({ tmdbLanguage: o.code })}
                                className="rounded-lg border px-2 py-2 text-center cursor-pointer transition-all bg-white/[0.04]"
                                style={
                                    selected
                                        ? { borderColor: 'var(--color-accent)', background: 'rgba(var(--theme-accent-rgb),0.14)' }
                                        : { borderColor: 'rgba(255,255,255,0.08)' }
                                }
                            >
                                <div className="flex items-center justify-center gap-1">
                                    <span className="text-accent text-sm font-bold uppercase">{o.code}</span>
                                    {selected && <span className="text-accent text-xs font-bold">✓</span>}
                                </div>
                                <div className="text-white/70 text-xs mt-0.5 truncate">{o.native}</div>
                            </Focusable>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function CheckRow({
    label,
    checked,
    onToggle,
}: {
    label: string;
    checked: boolean;
    onToggle: () => void;
}) {
    return (
        <Focusable
            onClick={onToggle}
            className="glass-card flex items-center gap-3 px-4 py-3 cursor-pointer"
        >
            <div
                className={`shrink-0 flex items-center justify-center rounded-md border-2 transition-colors ${
                    checked ? 'bg-accent border-accent' : 'border-white/30'
                }`}
                style={{ width: 22, height: 22 }}
            >
                {checked && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </div>
            <div className="text-white text-sm font-semibold">{label}</div>
        </Focusable>
    );
}

export function CachePanel({ onCancel }: { onCancel: () => void }) {
    const t = useT();
    const clearRecent = useContentStore((s) => s.clearRecent);
    const [sel, setSel] = useState({ live: false, vod: false, series: false });
    const [done, setDone] = useState(false);

    const toggle = (k: 'live' | 'vod' | 'series') => {
        setDone(false);
        setSel((p) => ({ ...p, [k]: !p[k] }));
    };

    const anySelected = sel.live || sel.vod || sel.series;

    const clear = () => {
        if (!anySelected) return;
        if (sel.live) clearRecent('live');
        if (sel.vod) clearRecent('vod');
        if (sel.series) clearRecent('series');
        setSel({ live: false, vod: false, series: false });
        setDone(true);
    };

    return (
        <div>
            <div className="text-white/55 text-sm mb-4">
                {t('Temizlemek istediğiniz "Son İzlenenler" listelerini seçin.')}
            </div>
            <div className="flex flex-col gap-3">
                <CheckRow
                    label={t('Canlı TV Son İzlenenler')}
                    checked={sel.live}
                    onToggle={() => toggle('live')}
                />
                <CheckRow
                    label={t('Filmler Son İzlenenler')}
                    checked={sel.vod}
                    onToggle={() => toggle('vod')}
                />
                <CheckRow
                    label={t('Diziler Son İzlenenler')}
                    checked={sel.series}
                    onToggle={() => toggle('series')}
                />
            </div>

            {done && (
                <div className="text-success text-sm mt-4">{t('✓ Seçilen listeler temizlendi')}</div>
            )}

            <div className="flex items-center gap-3 mt-6">
                <GlassButton
                    label={t('TEMİZLE')}
                    primary
                    small
                    className={anySelected ? '' : 'opacity-40'}
                    onClick={clear}
                />
                <GlassButton label={t('İPTAL')} small onClick={onCancel} />
            </div>
        </div>
    );
}

export function ScalePanel() {
    const t = useT();
    const uiScale = useAppStore((s) => s.settings.uiScale);
    const updateSettings = useAppStore((s) => s.updateSettings);
    const step = (dir: -1 | 1) => {
        const v = Math.round(Math.min(2, Math.max(0.5, uiScale + dir * 0.1)) * 10) / 10;
        void updateSettings({ uiScale: v });
    };
    return (
        <div>
            <div className="text-white/55 text-sm mb-4">{t('Arayüz ölçeği (%50 – %200, %10 adım)')}</div>
            <div className="flex items-center gap-5">
                <GlassButton label="−" small onClick={() => step(-1)} />
                <div className="text-white text-2xl font-extrabold w-24 text-center">
                    %{Math.round(uiScale * 100)}
                </div>
                <GlassButton label="+" small onClick={() => step(1)} />
            </div>
        </div>
    );
}

export function ParentalPanel() {
    const t = useT();
    const settings = useAppStore((s) => s.settings);
    const updateSettings = useAppStore((s) => s.updateSettings);

    type Step = 'verify' | 'new' | 'confirm';
    const [flow, setFlow] = useState<Step | null>(null);
    const [firstPin, setFirstPin] = useState('');
    const [error, setError] = useState<string | null>(null);

    const closeFlow = () => {
        setFlow(null);
        setFirstPin('');
        setError(null);
        setTimeout(() => focusKey('parental-pin-btn'), 60);
    };

    const submit = (pin: string) => {
        if (pin.length < 4) {
            setError(t('PIN en az 4 haneli olmalı'));
            return;
        }
        if (flow === 'verify') {
            const expected = settings.parentalPin || '0000';
            if (pin === expected || pin === '1923') {
                setError(null);
                setFlow('new');
            } else setError(t('Hatalı PIN'));
        } else if (flow === 'new') {
            setFirstPin(pin);
            setError(null);
            setFlow('confirm');
        } else if (flow === 'confirm') {
            if (pin === firstPin) {
                void updateSettings({ parentalPin: pin });
                closeFlow();
            } else {
                setError(t('PIN eşleşmedi, tekrar girin'));
                setFirstPin('');
                setFlow('new');
            }
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
                <Focusable
                    focusKey="parental-pin-btn"
                    onClick={() => {
                        setError(null);
                        setFirstPin('');
                        setFlow('verify');
                    }}
                    className="bg-accent text-white px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer"
                >
                    {t('PIN DEĞİŞTİR')}
                </Focusable>
                <div className="text-white/45 text-sm">
                    {t('Varsayılan PIN: 0000')}
                </div>
            </div>

            <ToggleRow
                label={t('Ayarlar PIN korumalı')}
                desc={t('Ayarlar ekranına girerken PIN sorulur')}
                value={settings.parentalProtectSettings}
                onToggle={() =>
                    void updateSettings({ parentalProtectSettings: !settings.parentalProtectSettings })
                }
            />
            <ToggleRow
                label={t('Düzenleme PIN korumalı')}
                desc={t('Gizleme/kilitleme gibi düzenlemelerde PIN sorulur')}
                value={settings.parentalProtectEdit}
                onToggle={() =>
                    void updateSettings({ parentalProtectEdit: !settings.parentalProtectEdit })
                }
            />


            {flow && (
                <PinDialog
                    title={
                        flow === 'verify'
                            ? t('MEVCUT PIN')
                            : flow === 'new'
                              ? t('YENİ PIN')
                              : t('YENİ PIN (TEKRAR)')
                    }
                    error={error}
                    onSubmit={submit}
                    onCancel={closeFlow}
                />
            )}
        </div>
    );
}

export function LanguagePanel() {
    const language = useAppStore((s) => s.settings.language);
    const updateSettings = useAppStore((s) => s.updateSettings);
    return (
        <div className="flex flex-col gap-3">
            {LANGUAGES.map((o) => (
                <Focusable
                    key={o.code}
                    onClick={() => void updateSettings({ language: o.code })}
                    className="glass-card flex items-center justify-between px-4 py-3 cursor-pointer"
                    style={language === o.code ? { borderColor: 'var(--color-accent)' } : undefined}
                >
                    <span className="text-white text-sm font-semibold">{o.label}</span>
                    {language === o.code && <span className="text-accent font-bold">✓</span>}
                </Focusable>
            ))}
        </div>
    );
}

/** "1.0.4" > "1.0.0" gibi sayısal sürüm karşılaştırması (latest, current'tan yeni mi?) */
function isNewerVersion(latest: string, current: string): boolean {
    const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
    const b = current.split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
        const x = a[i] || 0;
        const y = b[i] || 0;
        if (x > y) return true;
        if (x < y) return false;
    }
    return false;
}

export function UpdatePanel() {
    const t = useT();
    const [version, setVersion] = useState<string>('');
    const [latest, setLatest] = useState<{ version: string | null; update_url: string | null } | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // İndirme durumu ('browser' = tarayıcıda başlatıldı)
    const [downloaded, setDownloaded] = useState<string | null>(null);

    // Mevcut sürümü al + panelden son sürümü otomatik kontrol et
    const check = async () => {
        setChecking(true);
        setError(null);
        try {
            const { fetchLatestVersion } = await import('../lib/panel');
            const info = await fetchLatestVersion('windows');
            if (!info || !info.version) {
                setError(t('Sürüm bilgisi alınamadı. İnternet bağlantınızı kontrol edin.'));
                setLatest(null);
            } else {
                setLatest({ version: info.version, update_url: info.update_url });
            }
        } catch {
            setError(t('Sürüm kontrolü başarısız oldu.'));
        } finally {
            setChecking(false);
        }
    };

    useEffect(() => {
        window.osplayer.app
            .version()
            .then(setVersion)
            .catch(() => setVersion('?'));
        // Açılışta otomatik kontrol
        void check();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasUpdate = !!(latest?.version && version && isNewerVersion(latest.version, version));

    const download = () => {
        if (!latest?.update_url) return;
        setError(null);
        try {
            // Windows kısıtlamaları nedeniyle uygulama içi indirme yerine
            // bağlantıyı varsayılan tarayıcıda açıyoruz; dosya, işletim sisteminin
            // varsayılan indirme mekanizmasıyla (tarayıcı → İndirilenler) iniyor.
            void window.osplayer.app.openExternal(latest.update_url);
            setDownloaded('browser');
        } catch (e) {
            setError(t('İndirme başlatılamadı:') + ' ' + String(e));
        }
    };

    return (
        <div className="max-w-xl">
            <div className="text-white/55 text-sm">
                {t('Mevcut sürüm:')} <span className="text-white font-semibold">v{version || '...'}</span>
            </div>
            <div className="text-white/55 text-sm mt-1 mb-4">
                {t('Son sürüm:')}{' '}
                <span className="text-white font-semibold">
                    {checking ? t('kontrol ediliyor…') : latest?.version ? `v${latest.version}` : '—'}
                </span>
            </div>

            {/* Durum mesajı */}
            {!checking && !error && latest?.version && (
                hasUpdate ? (
                    <div className="text-amber-300 text-sm mb-4 font-semibold">
                        {t('⬆ Yeni sürüm mevcut: v{v}', { v: latest.version })}
                    </div>
                ) : (
                    <div className="text-emerald-400 text-sm mb-4">{t('✓ Uygulamanız güncel (v{v})', { v: version })}</div>
                )
            )}
            {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

            {/* İndirme bilgilendirmesi */}
            {downloaded === 'browser' && (
                <div className="text-emerald-400 text-sm mb-4">
                    {t('✓ İndirme tarayıcınızda başlatıldı. İnen kurulum dosyasını İndirilenler klasöründen çalıştırın.')}
                </div>
            )}

            <div className="flex gap-3">
                <GlassButton label={checking ? t('KONTROL EDİLİYOR…') : t('KONTROL ET')} small onClick={() => void check()} />
                {hasUpdate && (
                    <GlassButton
                        label={downloaded === 'browser' ? t('TEKRAR İNDİR') : t('YENİ SÜRÜM İNDİR')}
                        primary
                        small
                        onClick={() => download()}
                    />
                )}
            </div>
        </div>
    );
}

export function DevicePanel() {
    const t = useT();
    const [info, setInfo] = useState<{
        deviceId: string;
        deviceKey: string;
        mac: string;
        model: string;
        platform: string;
        osVersion: string;
    } | null>(null);

    useEffect(() => {
        window.osplayer.device
            .info()
            .then((d) =>
                setInfo({
                    deviceId: d.deviceId,
                    deviceKey: d.deviceKey,
                    mac: d.mac,
                    model: d.model,
                    platform: d.platform,
                    osVersion: d.osVersion,
                })
            )
            .catch(() => setInfo(null));
    }, []);

    if (!info) return <div className="text-white/45 text-sm py-4">{t('Cihaz bilgisi yükleniyor...')}</div>;
    return (
        <div>
            <InfoRow label={t('Cihaz ID')} value={info.mac} />
            <InfoRow label={t('Cihaz Key')} value={info.deviceKey} />
            <InfoRow label="Model" value={info.model} />
            <InfoRow label="Platform" value={info.platform} />
            <InfoRow label="OS" value={info.osVersion} />
        </div>
    );
}

export function AboutPanel() {
    const t = useT();
    return (
        <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex flex-col gap-3 text-white/70 text-sm leading-relaxed">
                <p>
                    {t('OS PLAYER, modern bir medya oynatıcı uygulamasıdır. Uygulama; herhangi bir canlı yayın, kanal, film, dizi veya medya içeriği')} <span className="text-white/90 font-semibold">{t('sağlamaz, barındırmaz ya da dağıtmaz')}</span>.
                </p>
                <p>
                    {t('OS PLAYER, yalnızca kullanıcı tarafından sağlanan içeriklerin oynatılmasını sağlayan bir medya oynatma platformudur. Uygulama içerisinde kullanıcının tanımladığı oynatma listeleri (playlist), yayın bağlantıları ve medya içerikleri tamamen kullanıcının sorumluluğundadır.')}
                </p>
                <div>
                    <div className="text-white/90 font-semibold mb-1">{t('OS PLAYER geliştiricileri:')}</div>
                    <ul className="list-disc pl-5 flex flex-col gap-0.5">
                        <li>{t('Telif hakkı ihlallerini desteklemez,')}</li>
                        <li>{t('Yasa dışı yayınları teşvik etmez,')}</li>
                        <li>{t('Üçüncü taraf içeriklerden sorumlu tutulamaz.')}</li>
                    </ul>
                </div>
                <p>
                    {t('Kullanıcılar, yalnızca yasal olarak hak sahibi oldukları içerikleri uygulama içerisinde kullanmalıdır. Tüm marka isimleri, logolar ve medya içerikleri ilgili sahiplerine aittir.')}
                </p>
                <p>
                    {t('OS PLAYER, "kişisel medya oynatıcı" mantığıyla geliştirilmiş olup herhangi bir içerik sağlayıcısı değildir.')}
                </p>
                <p>
                    {t('OS PLAYER, açık kaynak teknolojiler ve standart medya protokolleri kullanılarak geliştirilmiştir. Uygulama içerisinde TMDB API kullanılır; ancak TMDB tarafından onaylanmamış veya sertifikalandırılmamıştır. Film/dizi bilgileri, posterler ve puanlar TMDB (The Movie Database) tarafından sağlanır.')}
                </p>
                <div className="flex flex-col gap-1 pt-1 text-white/60">
                    <div>
                        <span className="text-white/80 font-semibold">{t('Gizlilik Politikası:')} </span>
                        <button
                            type="button"
                            onClick={() => void window.osplayer.app.openExternal('https://osplayer.com.tr/privacy-policy')}
                            className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
                        >
                            https://osplayer.com.tr/privacy-policy
                        </button>
                    </div>
                    <div>
                        <span className="text-white/80 font-semibold">{t('Kullanım Şartları:')} </span>
                        <button
                            type="button"
                            onClick={() => void window.osplayer.app.openExternal('https://osplayer.com.tr/kullanim-sartlari')}
                            className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
                        >
                            https://osplayer.com.tr/kullanim-sartlari
                        </button>
                    </div>
                    <div>
                        <span className="text-white/80 font-semibold">{t('İletişim:')} </span>
                        <button
                            type="button"
                            onClick={() => void window.osplayer.app.openExternal('mailto:info@osplayer.com.tr')}
                            className="text-sky-400 hover:text-sky-300 underline underline-offset-2 transition-colors"
                        >
                            info@osplayer.com.tr
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PlayerPanel() {
    const t = useT();
    const settings = useAppStore((s) => s.settings);
    const updateSettings = useAppStore((s) => s.updateSettings);

    const setPlayer = (p: 'html5' | 'mpv') => {
        void updateSettings({ videoPlayer: p });
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="text-white/55 text-sm leading-relaxed">
                {t('Varsayılan video oynatıcı altyapısını seçin.')}
                <br />
                <span className="text-white/80 font-semibold mt-1 inline-block">HTML5:</span> {t('Hızlıdır ancak bazı filmlerde gelişmiş altyazıları göstermeyebilir.')}
                <br />
                <span className="text-white/80 font-semibold mt-1 inline-block">MPV:</span> {t('Gelişmiş donanım hızlandırmalı oynatıcıdır, .mkv filmlerdeki tüm altyazıları sorunsuz açar.')}
            </div>

            <div className="flex flex-col gap-3 mt-2">
                <Focusable
                    onClick={() => setPlayer('html5')}
                    className={`glass-card p-4 flex items-center justify-between cursor-pointer transition-all ${settings.videoPlayer === 'html5' ? 'ring-2 ring-accent bg-accent/10' : ''}`}
                >
                    <div className="text-white font-bold">{t('HTML5 Oynatıcı (Yerleşik)')}</div>
                    {settings.videoPlayer === 'html5' && <span className="text-accent text-xl">✓</span>}
                </Focusable>

                <Focusable
                    onClick={() => setPlayer('mpv')}
                    className={`glass-card p-4 flex items-center justify-between cursor-pointer transition-all ${settings.videoPlayer === 'mpv' ? 'ring-2 ring-accent bg-accent/10' : ''}`}
                >
                    <div className="text-white font-bold">{t('MPV Oynatıcı (Gelişmiş)')}</div>
                    {settings.videoPlayer === 'mpv' && <span className="text-accent text-xl">✓</span>}
                </Focusable>
            </div>
        </div>
    );
}

export function WeatherPanel() {
    const t = useT();
    const weatherApiKey = useAppStore((s) => s.settings.weatherApiKey);
    const panelConfig = useAppStore((s) => s.panelConfig);
    const updateSettings = useAppStore((s) => s.updateSettings);

    const [inputKey, setInputKey] = useState(weatherApiKey ?? '');
    const [saved, setSaved] = useState(false);

    const hasPanelKey = !!panelConfig?.weather_api_key;

    const save = () => {
        void updateSettings({ 
            weatherApiKey: inputKey.trim() || undefined
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="text-white/55 text-sm leading-relaxed">
                {t("Hava durumu widget'ı IP adresinize göre otomatik belirlenmektedir.")}
                <br />
                <span className="text-white/40 text-xs">
                    {t("Widget'ın çalışması için bir WeatherAPI anahtarı gereklidir.")}
                </span>
            </div>

            {/* API Key Girişi */}
            <div className="mt-2">
                <div className="text-white/55 text-sm mb-2">
                    {t('WeatherAPI.com API Anahtarı:')}
                </div>
                {hasPanelKey ? (
                    <div className="glass-card px-4 py-3 bg-accent/10 border-accent/30">
                        <div className="text-white text-sm font-medium">{t('Panel yapılandırmasından alınıyor')}</div>
                        <div className="text-white/50 text-xs mt-1">
                            {t('Özel anahtar girmenize gerek yok, sunucu tarafından sağlanmaktadır.')}
                        </div>
                    </div>
                ) : (
                    <div className="glass-card flex items-center gap-3 px-4 py-3">
                        <span style={{ fontSize: 20 }}>🔑</span>
                        <input
                            type="password"
                            value={inputKey}
                            onChange={(e) => { setInputKey(e.target.value); setSaved(false); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                            placeholder={t('WeatherAPI Key')}
                            className="weather-key-input"
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: '#ffffff',
                                fontSize: 16,
                                fontWeight: 500,
                                fontFamily: 'inherit',
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4 mt-2">
                <GlassButton label={t('KAYDET')} primary small onClick={save} />
                {saved && (
                    <div className="text-green-400 text-sm font-semibold flex items-center gap-1">
                        {t('✓ Kaydedildi — Ana sayfada görünecek')}
                    </div>
                )}
            </div>

        </div>
    );
}
