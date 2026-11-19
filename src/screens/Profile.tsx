import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/appStore';
import { Focusable, TopBar } from '../components/common';
import { bridge } from '../lib/ipc';
import { useT, translate } from '../lib/i18n';

interface DeviceInfo {
    deviceId: string;
    deviceKey: string;
}

/** exp_date (epoch saniye) → "gg.aa.yyyy"; null/0/boş → SINIRSIZ */
function formatExpDate(value: string | null | undefined): string {
    if (!value || value === 'null' || value === '0')
        return translate(useAppStore.getState().settings.language, 'SINIRSIZ');
    const ts = Number(value);
    if (!Number.isFinite(ts) || ts <= 0) return value;
    return new Date(ts * 1000).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function InfoRow({
    label,
    value,
    valueClass = 'text-white',
    action,
}: {
    label: string;
    value: string;
    valueClass?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5">
            <div className="text-white/50 text-sm font-medium tracking-widest shrink-0">{label}</div>
            <div className="flex items-center gap-2 min-w-0">
                <div className={`text-sm font-bold truncate ${valueClass}`}>{value}</div>
                {action}
            </div>
        </div>
    );
}

function CopyButton({ value, autoFocus }: { value: string; autoFocus?: boolean }) {
    const t = useT();
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <Focusable
            autoFocus={autoFocus}
            onClick={copy}
            className={`glass-card px-3 py-1 rounded-lg cursor-pointer text-xs font-bold tracking-wider shrink-0 ${
                copied ? 'text-success' : 'text-white/80'
            }`}
        >
            {copied ? t('KOPYALANDI') : t('KOPYALA')}
        </Focusable>
    );
}

/** Kullanıcı bilgileri — APK ProfileScreen.kt karşılığı. */
export default function ProfileScreen() {
    const t = useT();
    const session = useAppStore((s) => s.session);
    const activeAccount = useAppStore((s) => s.activeAccount);
    const back = useAppStore((s) => s.back);

    const [device, setDevice] = useState<DeviceInfo | null>(null);

    useEffect(() => {
        bridge()
            .device.info()
            .then((d) => setDevice({ deviceId: d.deviceId, deviceKey: d.deviceKey }))
            .catch(() => setDevice(null));
    }, []);

    const user = session?.user_info;
    const isActive = (user?.status ?? 'Active').toLowerCase() === 'active';

    return (
        <div className="bg-app-gradient h-full w-full flex flex-col">
            <TopBar centerTitle={t('KULLANICI BİLGİLERİ')} onBack={() => back()} />

            <div className="flex-1 flex items-center justify-center px-6 pb-10 overflow-y-auto">
                <div className="surface-card w-full p-7" style={{ maxWidth: 500 }}>
                    {/* Başlık */}
                    <div className="flex items-center gap-4 mb-4">
                        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-accent/20 text-accent">
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                            </svg>
                        </div>
                        <div className="text-white font-extrabold tracking-widest text-lg">
                            {t('KULLANICI BİLGİLERİ')}
                        </div>
                    </div>

                    <div className="border-t border-white/10 mb-3" />

                    <InfoRow
                        label={t('KULLANICI ADI')}
                        value={user?.username ?? activeAccount?.username ?? '---'}
                    />
                    <InfoRow
                        label={t('HESAP DURUMU')}
                        value={isActive ? t('AKTİF') : (user?.status ?? '---')}
                        valueClass={isActive ? 'text-success' : 'text-error'}
                    />
                    <InfoRow label={t('BİTİŞ TARİHİ')} value={formatExpDate(user?.exp_date)} />
                    <InfoRow
                        label={t('MAX BAĞLANTI')}
                        value={`${user?.active_cons ?? '0'} / ${user?.max_connections ?? '1'}`}
                    />
                </div>
            </div>
        </div>
    );
}
