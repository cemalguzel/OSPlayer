import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { useAppStore } from '../store/appStore';
import {
    ConfirmDialog,
    Focusable,
    GlassButton,
    LoadingOverlay,
    TopBar,
} from '../components/common';
import { bridge } from '../lib/ipc';
import { useT } from '../lib/i18n';
import type { Account } from '../types';

interface DeviceInfo {
    deviceId: string;
    deviceKey: string;
    mac: string;
}

function accountKey(a: Account): string {
    return `${a.accountName ?? ''}|${a.username}|${a.serverUrl ?? ''}`;
}

/** KOPYALA butonu — tıklayınca 1.5sn "KOPYALANDI" gösterir */
function CopyButton({ value }: { value: string }) {
    const t = useT();
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <Focusable
            onClick={copy}
            className={`glass-card px-3 py-1 rounded-lg cursor-pointer text-xs font-bold tracking-wider ${
                copied ? 'text-success' : 'text-white/80'
            }`}
        >
            {copied ? t('KOPYALANDI') : t('KOPYALA')}
        </Focusable>
    );
}

/** Hesap yönetimi — APK AccountManagerScreen.kt karşılığı. */
export default function AccountManagerScreen() {
    const t = useT();
    const accounts = useAppStore((s) => s.accounts);
    const saveAccounts = useAppStore((s) => s.saveAccounts);
    const loginWithAccount = useAppStore((s) => s.loginWithAccount);
    const back = useAppStore((s) => s.back);
    const push = useAppStore((s) => s.push);
    const replace = useAppStore((s) => s.replace);

    const [device, setDevice] = useState<DeviceInfo | null>(null);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
    const [confirmExit, setConfirmExit] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        bridge()
            .device.info()
            .then((d) => setDevice({ deviceId: d.deviceId, deviceKey: d.deviceKey, mac: d.mac }))
            .catch(() => setDevice(null));
    }, []);

    const onBack = () => {
        // Yığında tek route varsa uygulamadan çıkış onayı iste
        if (!back()) setConfirmExit(true);
    };

    const selectAccount = async (acc: Account) => {
        if (switching) return;
        setSwitching(true);
        setError(null);
        try {
            const res = await loginWithAccount(acc);
            if (res.ok) {
                replace('dashboard');
                return;
            }
            setError(res.error ?? t('Giriş başarısız'));
        } catch {
            setError(t('Sunucuya bağlanılamadı'));
        } finally {
            setSwitching(false);
        }
    };

    const deleteAccount = async (acc: Account) => {
        const next = accounts.filter((a) => accountKey(a) !== accountKey(acc));
        await saveAccounts(next);
        setDeleteTarget(null);
    };

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await useAppStore.getState().syncRemoteAccounts();
        } finally {
            setTimeout(() => setRefreshing(false), 600);
        }
    };

    return (
        <div className="bg-app-gradient relative h-full w-full flex flex-col">
            <TopBar centerTitle={t('HESAP YÖNETİMİ')} centerSubtitle={t('Devam etmek için bir hesap seçin')} onBack={onBack} />

            <div className="flex flex-1 gap-6 px-8 pb-8 min-h-0 pt-4">
                {/* SOL: Hesap kartları */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 -mx-4 pt-2 -mt-3">
                    {error && (
                        <div className="text-error text-sm font-semibold mb-3">{error}</div>
                    )}
                    <div className="grid grid-cols-3 gap-5">
                        {accounts.map((acc, i) => {
                            const isManual = acc.isManual !== false;
                            return (
                                <div key={accountKey(acc)} className="flex flex-col gap-2">
                                    <Focusable
                                        autoFocus={i === 0}
                                        onClick={() => void selectAccount(acc)}
                                        className="surface-card relative flex flex-col items-center justify-center gap-2 h-36 cursor-pointer p-3"
                                    >
                                        <div
                                            className={`flex items-center justify-center w-12 h-12 rounded-full shadow-inner ${
                                                acc.isActive ? 'bg-accent shadow-accent/50' : 'bg-white/10'
                                            }`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white drop-shadow-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                <circle cx="12" cy="7" r="4" />
                                            </svg>
                                        </div>
                                        <div className="text-white font-bold text-sm truncate max-w-full">
                                            {acc.accountName || acc.username}
                                        </div>
                                        <div className="text-white/40 text-xs truncate max-w-full">
                                            {acc.username}
                                        </div>
                                        {acc.isActive && (
                                            <div className="absolute top-2 left-2 bg-success text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                {t('AKTİF')}
                                            </div>
                                        )}
                                        {!isManual && (
                                            <div className="absolute top-2 right-2 bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                                ONLINE
                                            </div>
                                        )}
                                    </Focusable>
                                    {isManual && (
                                        <div className="flex gap-2">
                                            <GlassButton
                                                label={t('DÜZENLE')}
                                                small
                                                className="flex-1"
                                                onClick={() => push('login', { editAccount: acc })}
                                            />
                                            <GlassButton
                                                label={t('SİL')}
                                                small
                                                danger
                                                className="flex-1"
                                                onClick={() => setDeleteTarget(acc)}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* + HESAP EKLE kartı */}
                        <Focusable
                            autoFocus={accounts.length === 0}
                            onClick={() => push('login')}
                            className="flex flex-col items-center justify-center gap-2 h-36 cursor-pointer rounded-xl border-2 border-dashed border-white/15 text-white/40"
                        >
                            <div className="text-3xl">+</div>
                            <div className="text-xs font-bold tracking-widest">{t('HESAP EKLE')}</div>
                        </Focusable>
                    </div>
                </div>

                {/* SAĞ: Bilgi paneli (QR Code & Bilgiler) — tam yükseklikte, kaydırmasız */}
                <div className="surface-card shrink-0 p-6 flex flex-col gap-4 overflow-y-auto items-center text-center" style={{ width: 340 }}>
                    <div className="text-white font-bold text-lg tracking-wide mb-2 leading-tight">
                        {t('Uygulamayı Kullanmaya')}<br />{t('Devam Etmek İçin')}
                    </div>
                    <div className="text-white/80 text-[13px] leading-relaxed mb-1">
                        {t('Web sitemizi ziyaret ederek kendi oynatma listenizi ekleyebilirsiniz.')}
                    </div>
                    
                    <div className="text-success text-[15px] font-bold mb-2">
                        https://osplayer.com.tr/login
                    </div>

                    {/* WEB PANEL — QR koddaki ile aynı bağlantıyı (cihaz ID + key) tarayıcıda açar */}
                    <Focusable
                        onClick={() =>
                            void window.osplayer.app.openExternal(
                                `https://osplayer.com.tr/login?mac=${encodeURIComponent(device?.mac ?? '')}&device_key=${encodeURIComponent(device?.deviceKey ?? '')}`,
                            )
                        }
                        className="glass-card flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl cursor-pointer text-white font-bold text-sm tracking-wider mb-3 hover:text-accent transition-colors"
                    >
                        <span className="text-base">🌐</span>
                        WEB PANEL
                    </Focusable>

                    {device && (
                        <div className="bg-white p-3 rounded-xl mb-3">
                            <QRCode
                                value={`https://osplayer.com.tr/login?mac=${device.mac}&device_key=${device.deviceKey}`}
                                size={140}
                                level="M"
                            />
                        </div>
                    )}

                    <div className="flex flex-col gap-2 w-full font-bold text-white mb-2 items-center text-center">
                        <div className="text-[15px]">{t('Cihaz Kimliği: {value}', { value: device?.mac?.toUpperCase() ?? '---' })}</div>
                        <div className="text-[15px]">{t('Cihaz Anahtarı: {value}', { value: device?.deviceKey ?? '---' })}</div>
                    </div>

                    <GlassButton
                        label={refreshing ? t('Yenileniyor...') : t('Yenile')}
                        icon={<span className={`text-xl inline-block ${refreshing ? 'animate-spin' : ''}`}>↻</span>}
                        className="w-full mt-auto"
                        onClick={handleRefresh}
                    />
                </div>
            </div>

            {switching && <LoadingOverlay text={t('Bağlanıyor...')} />}

            {deleteTarget && (
                <ConfirmDialog
                    title={t('HESABI SİL')}
                    text={t('"{name}" hesabı silinecek. Emin misiniz?', { name: deleteTarget.accountName || deleteTarget.username })}
                    confirmLabel={t('SİL')}
                    onConfirm={() => void deleteAccount(deleteTarget)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {confirmExit && (
                <ConfirmDialog
                    title={t('UYGULAMADAN ÇIK')}
                    text={t('Uygulamayı kapatmak istediğinize emin misiniz?')}
                    confirmLabel={t('ÇIK')}
                    onConfirm={() => void window.osplayer.app.quit()}
                    onCancel={() => setConfirmExit(false)}
                />
            )}
        </div>
    );
}
