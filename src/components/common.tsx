import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { focusFirst } from '../nav/spatial';
import { bridge } from '../lib/ipc';
import { useT } from '../lib/i18n';
import logoSplash from '../assets/logo_splash.png';


/** ===== Ortak UI bileşenleri (APK glass tasarımı) ===== */

export function Spinner({ size = 40 }: { size?: number }) {
    return <div className="osp-spinner" style={{ width: size, height: size }} />;
}

export function Logo({ height = 64 }: { height?: number }) {
    return (
        <img
            src={logoSplash}
            alt="OSPlayer"
            className="select-none object-contain"
            style={{ height, width: 'auto', maxWidth: height * 3.2 }}
            draggable={false}
        />
    );
}

interface FocusableProps extends React.HTMLAttributes<HTMLDivElement> {
    autoFocus?: boolean;
    focusKey?: string;
    disabled?: boolean;
    children?: React.ReactNode;
}

/** Odaklanabilir sarmalayıcı — data-focusable + tabIndex standardı */
export function Focusable({ autoFocus, focusKey, disabled, children, ...rest }: FocusableProps) {
    return (
        <div
            {...rest}
            tabIndex={-1}
            data-focusable
            data-autofocus={autoFocus ? 'true' : undefined}
            data-focus-key={focusKey}
            data-focus-disabled={disabled ? 'true' : undefined}
        >
            {children}
        </div>
    );
}

interface GlassButtonProps {
    label: string;
    icon?: React.ReactNode;
    onClick?: () => void;
    primary?: boolean;
    danger?: boolean;
    autoFocus?: boolean;
    focusKey?: string;
    className?: string;
    small?: boolean;
}

export function GlassButton({
    label,
    icon,
    onClick,
    primary,
    danger,
    autoFocus,
    focusKey,
    className = '',
    small,
}: GlassButtonProps) {
    const base = primary
        ? 'bg-accent text-white'
        : danger
          ? 'bg-error/20 text-error border border-error/40'
          : 'glass-card text-white';
    return (
        <Focusable
            autoFocus={autoFocus}
            focusKey={focusKey}
            onClick={onClick}
            className={`${base} flex items-center justify-center gap-2 rounded-xl font-semibold cursor-pointer ${
                small ? 'px-4 py-1.5 text-[15px]' : 'px-6 py-3 text-base'
            } ${className}`}
        >
            {icon}
            <span>{label}</span>
        </Focusable>
    );
}

interface GlassInputProps {
    label: string;
    icon?: React.ReactNode;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    autoFocus?: boolean;
}

export function GlassInput({ label, icon, value, onChange, placeholder, type = 'text', autoFocus }: GlassInputProps) {
    return (
        <div className="w-full">
            <div className="flex items-center gap-2 mb-1.5 text-white/60 text-xs font-bold tracking-widest">
                {icon}
                <span>{label}</span>
            </div>
            <input
                tabIndex={-1}
                data-focusable
                data-autofocus={autoFocus ? 'true' : undefined}
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-white text-base outline-none border"
                style={{ background: '#050507', borderColor: 'rgba(255,255,255,0.1)' }}
            />
        </div>
    );
}

/** Üst bar: geri butonu + başlık + sağ aksiyonlar */
export function TopBar({
    title,
    centerTitle,
    centerSubtitle,
    onBack,
    right,
}: {
    title?: string;
    centerTitle?: string;
    centerSubtitle?: string;
    onBack?: () => void;
    right?: React.ReactNode;
}) {
    const t = useT();
    return (
        <div className="flex items-center gap-4 px-8 pt-6 pb-4">
            {onBack && (
                <Focusable
                    onClick={onBack}
                    focusKey="topbar-back"
                    className="glass-card flex items-center justify-center px-5 h-11 rounded-full cursor-pointer text-white font-bold gap-2"
                >
                    <span className="text-xl">←</span>
                    <span className="text-[15px] tracking-wider">{t('GERİ')}</span>
                </Focusable>
            )}
            {title && <h1 className="text-2xl font-extrabold tracking-[0.15em] text-white">{title}</h1>}
            {centerTitle && (
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <h1 className="text-2xl font-extrabold tracking-[0.15em] text-white whitespace-nowrap">
                        {centerTitle}
                    </h1>
                    {centerSubtitle && (
                        <div className="text-white/50 text-sm mt-1">
                            {centerSubtitle}
                        </div>
                    )}
                </div>
            )}
            <div className="flex-1" />
            {right}
        </div>
    );
}

/** Modal iskeleti — data-focus-layer ile odak tuzağı kurar */
export function Modal({
    children,
    onMount,
    width = 480,
    offsetX = 0,
}: {
    children: React.ReactNode;
    onMount?: () => void;
    width?: number;
    /** İç kartı yatayda kaydırır (negatif = sola). Örn. video penceresinin altında kalmaması için. */
    offsetX?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // Katman açılınca ilk odağı içeride kur
        const t = setTimeout(() => {
            if (ref.current) focusFirst(ref.current);
            onMount?.();
        }, 30);
        return () => clearTimeout(t);
    }, [onMount]);
    return (
        <div
            data-focus-layer
            ref={ref}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(5,5,7,0.75)' }}
        >
            <div
                className="surface-card p-7"
                style={{
                    width,
                    background: 'rgba(var(--theme-surface-rgb),0.95)',
                    transform: offsetX ? `translateX(${offsetX}px)` : undefined,
                }}
            >
                {children}
            </div>
        </div>
    );
}

export function ConfirmDialog({
    title,
    text,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
}: {
    title: string;
    text?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const t = useT();
    useEffect(() => {
        const h = () => onCancel();
        window.addEventListener('app-back', h);
        return () => window.removeEventListener('app-back', h);
    }, [onCancel]);
    return (
        <Modal>
            <div className="text-lg font-bold text-white mb-2">{title}</div>
            {text && <div className="text-white/60 text-sm mb-5">{text}</div>}
            <div className="flex gap-3 justify-end mt-4">
                <GlassButton label={cancelLabel ?? t('VAZGEÇ')} onClick={onCancel} small autoFocus />
                <GlassButton label={confirmLabel ?? t('EVET')} onClick={onConfirm} primary small />
            </div>
        </Modal>
    );
}

/** PIN dialoğu (ebeveyn kontrolü) */
export function PinDialog({
    title,
    onSubmit,
    onCancel,
    error,
    offsetX = 0,
}: {
    title?: string;
    onSubmit: (pin: string) => void;
    onCancel: () => void;
    error?: string | null;
    /** İç kartı yatayda kaydırır (negatif = sola). */
    offsetX?: number;
}) {
    const t = useT();
    const [pin, setPin] = React.useState('');
    // Adım (başlık) değiştiğinde ya da bir hata oluştuğunda giriş alanını temizle —
    // ör. MEVCUT PIN → YENİ PIN geçişinde veya hatalı PIN sonrası önceki PIN ekranda kalmasın.
    useEffect(() => {
        setPin('');
    }, [title, error]);
    useEffect(() => {
        const h = () => onCancel();
        window.addEventListener('app-back', h);
        return () => window.removeEventListener('app-back', h);
    }, [onCancel]);
    const press = (d: string) => {
        if (d === 'sil') setPin((p) => p.slice(0, -1));
        else if (pin.length < 6) setPin((p) => p + d);
    };
    return (
        <Modal width={380} offsetX={offsetX}>
            <div className="text-base font-bold text-white tracking-widest mb-1 text-center">{title ?? t('EBEVEYN KONTROLÜ')}</div>
            <div className="text-center text-2xl tracking-[0.5em] text-accent font-mono my-4 h-8">
                {'•'.repeat(pin.length) || <span className="text-white/25">PIN</span>}
            </div>
            {error && <div className="text-error text-sm text-center mb-3">{error}</div>}
            <div className="grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'sil', '0', 'ok'].map((k, i) => (
                    <Focusable
                        key={k}
                        autoFocus={i === 0}
                        onClick={() => (k === 'ok' ? onSubmit(pin) : press(k))}
                        className={`glass-card flex items-center justify-center h-12 rounded-lg cursor-pointer font-bold ${
                            k === 'ok' ? 'bg-accent' : ''
                        }`}
                    >
                        {k === 'sil' ? '⌫' : k === 'ok' ? t('TAMAM') : k}
                    </Focusable>
                ))}
            </div>
        </Modal>
    );
}

export function EmptyState({ text }: { text: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-white/40 gap-3 py-16">
            <div className="text-5xl opacity-40">📺</div>
            <div className="text-base">{text}</div>
        </div>
    );
}

/** Yüklenme kaplaması */
export function LoadingOverlay({ text }: { text?: string }) {
    const t = useT();
    return (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg-deep/70">
            <Spinner />
            <div className="text-white/70 text-sm">{text ?? t('Yükleniyor...')}</div>
        </div>
    );
}

/**
 * Cihaz panelden yasaklandığında / süresi dolduğunda tüm uygulamayı kaplayan
 * engelleme ekranı. İçeriğe erişimi tamamen kapatır; yalnızca "Tekrar Kontrol Et"
 * butonu vardır (panelden yasak kalkmışsa otomatik normale döner).
 */
export function BlockedScreen({
    status,
    onRecheck,
}: {
    status: string;
    onRecheck: () => void;
}) {
    const t = useT();
    const [checking, setChecking] = React.useState(false);
    const [device, setDevice] = useState<{ deviceKey: string; mac: string } | null>(null);
    const banned = status === 'banned';
    const repair = status === 'repair';

    const title = banned
        ? t('ERİŞİM YASAKLANDI')
        : repair
          ? t('CİHAZ YENİDEN EŞLEME GEREKİYOR')
          : t('ERİŞİM SÜRESİ DOLDU');
    // Cihaz ID / Key bilgisini yükle (QR + WEB PANEL bağlantısı için)
    useEffect(() => {
        bridge()
            .device.info()
            .then((d) => setDevice({ deviceKey: d.deviceKey, mac: d.mac }))
            .catch(() => setDevice(null));
    }, []);

    // Engel ekranındayken geri tuşu uygulamadan çıkışı/alttaki ekranı tetiklemesin
    // + ekran açılınca odağı butona kur.
    useEffect(() => {
        const stop = (e: Event) => e.stopImmediatePropagation();
        window.addEventListener('app-back', stop, true);
        const t = setTimeout(() => focusFirst(), 50);
        return () => {
            window.removeEventListener('app-back', stop, true);
            clearTimeout(t);
        };
    }, []);

    const recheck = async () => {
        setChecking(true);
        try {
            await onRecheck();
        } finally {
            setChecking(false);
        }
    };

    const panelUrl = `https://osplayer.com.tr/login?mac=${encodeURIComponent(
        device?.mac ?? '',
    )}&device_key=${encodeURIComponent(device?.deviceKey ?? '')}`;

    return (
        <div
            data-focus-layer
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center text-center px-8 overflow-y-auto py-8"
            style={{ background: 'rgba(5,5,7,0.97)' }}
        >
            <div className="text-6xl mb-4">🚫</div>
            <h1 className="text-3xl font-extrabold tracking-[0.12em] text-error mb-6">{title}</h1>

            {/* Uygulamayı satın alma / web paneli bilgi kartı */}
            <div
                className="surface-card p-6 flex flex-col gap-3 items-center text-center mb-6"
                style={{ width: 360, maxWidth: '90vw' }}
            >
                <div className="text-white/80 text-[13px] leading-relaxed">
                    {t('Uygulamayı kullanmaya devam etmek için lisans satın almanız gerekiyor.')}
                </div>

                <div className="text-success text-[15px] font-bold">
                    https://osplayer.com.tr/login
                </div>

                {/* WEB PANEL — QR koddaki ile aynı bağlantıyı (cihaz ID + key) tarayıcıda açar */}
                <Focusable
                    onClick={() => void window.osplayer.app.openExternal(panelUrl)}
                    className="glass-card flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl cursor-pointer text-white font-bold text-sm tracking-wider hover:text-accent transition-colors"
                >
                    <span className="text-base">🌐</span>
                    WEB PANEL
                </Focusable>

                {device && (
                    <div className="bg-white p-3 rounded-xl">
                        <QRCode value={panelUrl} size={140} level="M" />
                    </div>
                )}

                <div className="flex flex-col gap-1 w-full font-bold text-white items-center text-center">
                    <div className="text-[15px]">{t('Cihaz ID: {v}', { v: device?.mac ?? '---' })}</div>
                    <div className="text-[15px]">{t('Cihaz Key: {v}', { v: device?.deviceKey ?? '---' })}</div>
                </div>
            </div>

            <GlassButton
                label={checking ? t('KONTROL EDİLİYOR...') : t('TEKRAR KONTROL ET')}
                onClick={checking ? undefined : recheck}
                primary
                autoFocus
            />
        </div>
    );
}

/**
 * Kanal listesi güncellenirken gösterilen LG WebOS tarzı overlay.
 * Ekran ortasında, tam arka plan karartmasıyla "Lütfen Bekleyin" kartı.
 */
export function SyncOverlay({ message }: { message: string }) {
    const t = useT();
    return (
        <div className="sync-overlay-backdrop">
            <div className="sync-overlay-box">
                <div className="sync-overlay-spinner" />
                <div className="sync-overlay-title">{t('Lütfen Bekleyin')}</div>
                <div className="sync-overlay-msg">{t(message)}</div>
            </div>
        </div>
    );
}
