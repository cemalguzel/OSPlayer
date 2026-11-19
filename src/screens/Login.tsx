import { useState } from 'react';
import { useAppStore, useCurrentRoute } from '../store/appStore';
import { Focusable, GlassButton, GlassInput, Logo, LoadingOverlay } from '../components/common';
import type { Account } from '../types';
import { useT } from '../lib/i18n';

/** Göz (şifre göster/gizle) ikonları — harici paket yok, inline SVG */
function EyeIcon({ off }: { off?: boolean }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            <circle cx="12" cy="12" r="3" />
            {off && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
    );
}

/**
 * Hesap ekleme / düzenleme ekranı — APK LoginScreen.kt karşılığı.
 * Route param: { editAccount?: Account } (Hesap Yönetimi → DÜZENLE).
 */
export default function LoginScreen() {
    const t = useT();
    const route = useCurrentRoute();
    const editAccount = route.params?.editAccount as Account | undefined;

    const accounts = useAppStore((s) => s.accounts);
    const saveAccounts = useAppStore((s) => s.saveAccounts);
    const loginWithAccount = useAppStore((s) => s.loginWithAccount);
    const replace = useAppStore((s) => s.replace);
    const push = useAppStore((s) => s.push);

    const [accountName, setAccountName] = useState(editAccount?.accountName ?? '');
    const [serverUrl, setServerUrl] = useState(editAccount?.serverUrl ?? '');
    const [username, setUsername] = useState(editAccount?.username ?? '');
    const [password, setPassword] = useState(editAccount?.password ?? '');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        if (loading) return;
        const user = username.trim();
        const pass = password.trim();
        if (!user || !pass) {
            setError(t('Kullanıcı adı ve şifre zorunludur'));
            return;
        }
        setError(null);
        setLoading(true);

        const acc: Account = {
            accountName: accountName.trim() || undefined,
            serverUrl: serverUrl.trim() || undefined,
            username: user,
            password: pass,
            isManual: true,
        };

        // Listeye ekle/güncelle: düzenlemede eski kaydın yerine yaz, yenide aynı
        // kullanıcı+sunucu varsa üstüne yaz, yoksa sona ekle
        const list = [...accounts];
        const idx = editAccount
            ? list.findIndex(
                  (a) =>
                      a.username === editAccount.username &&
                      (a.serverUrl ?? '') === (editAccount.serverUrl ?? '') &&
                      (a.accountName ?? '') === (editAccount.accountName ?? '')
              )
            : list.findIndex(
                  (a) => a.username === acc.username && (a.serverUrl ?? '') === (acc.serverUrl ?? '')
              );
        if (idx >= 0) list[idx] = { ...list[idx], ...acc };
        else list.push(acc);
        await saveAccounts(list);

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
            setLoading(false);
        }
    };

    return (
        <div className="bg-app-gradient relative h-full w-full flex flex-col items-center justify-center gap-8 px-6 overflow-y-auto">
            <Logo height={64} />

            <div className="surface-card w-full p-8 flex flex-col gap-4" style={{ maxWidth: 520 }}>
                <div className="text-white font-extrabold tracking-widest text-base text-center mb-1">
                    {editAccount ? t('HESAP DÜZENLE') : t('HESAP EKLE')}
                </div>

                <GlassInput
                    label={t('HESAP ADI')}
                    icon={<span>🏷️</span>}
                    value={accountName}
                    onChange={setAccountName}
                    placeholder={t('Örn: Ev, Ofis, Çocuk')}
                    autoFocus
                />
                <GlassInput
                    label={t('SUNUCU URL')}
                    icon={<span>🌐</span>}
                    value={serverUrl}
                    onChange={setServerUrl}
                    placeholder="http://urladresi.com:port"
                />
                <GlassInput
                    label={t('KULLANICI ADI')}
                    icon={<span>👤</span>}
                    value={username}
                    onChange={setUsername}
                    placeholder={t('Kullanıcı adınız')}
                />
                <div className="flex items-end gap-2">
                    <div className="flex-1">
                        <GlassInput
                            label={t('ŞİFRE')}
                            icon={<span>🔒</span>}
                            value={password}
                            onChange={setPassword}
                            placeholder="••••••••"
                            type={showPassword ? 'text' : 'password'}
                        />
                    </div>
                    <Focusable
                        onClick={() => setShowPassword((v) => !v)}
                        className="glass-card flex items-center justify-center w-12 cursor-pointer text-white/60"
                        style={{ height: 50 }}
                        title={showPassword ? t('Şifreyi gizle') : t('Şifreyi göster')}
                    >
                        <EyeIcon off={showPassword} />
                    </Focusable>
                </div>

                {error && (
                    <div className="text-error text-sm text-center font-semibold">{error}</div>
                )}

                <div className="flex flex-col gap-3 mt-2">
                    <GlassButton label={t('GİRİŞ')} primary onClick={() => void submit()} className="tracking-widest" />
                    <GlassButton
                        label={t('HESAP YÖNETİMİ')}
                        onClick={() => push('accounts')}
                        className="tracking-widest"
                    />
                </div>
            </div>

            {loading && <LoadingOverlay text={t('Bağlanıyor...')} />}
        </div>
    );
}
