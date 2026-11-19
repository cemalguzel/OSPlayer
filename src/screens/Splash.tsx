import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { Logo, Spinner } from '../components/common';
import { storeGet } from '../lib/ipc';
import type { Account } from '../types';

/** storeSet('lastAccount', ...) ile kaydedilen biçim (appStore.loginWithAccount) */
interface LastAccountRef {
    username: string;
    serverUrl: string;
}

const MIN_SPLASH_MS = 1200;

/**
 * Açılış ekranı — APK SplashScreen.kt karşılığı.
 * init() App.tsx'te çağrılır; burada initialized beklenir, sonra son hesapla
 * otomatik giriş denenir. Minimum 1.2sn splash gösterilir.
 */
export default function SplashScreen() {
    const initialized = useAppStore((s) => s.initialized);
    const startedRef = useRef(false);
    const mountedAtRef = useRef(Date.now());

    useEffect(() => {
        if (!initialized || startedRef.current) return;
        startedRef.current = true;
        let cancelled = false;

        const run = async () => {
            const { accounts, loginWithAccount, replace } = useAppStore.getState();

            // Hedef route'u belirle
            let target: 'dashboard' | 'accounts' = 'accounts';
            if (accounts.length > 0) {
                const last = await storeGet<LastAccountRef | null>('lastAccount', null);
                if (last && last.username) {
                    const match = accounts.find(
                        (a: Account) =>
                            a.username === last.username && (a.serverUrl ?? '') === (last.serverUrl ?? '')
                    );
                    if (match) {
                        try {
                            const res = await loginWithAccount(match);
                            if (res.ok) target = 'dashboard';
                        } catch {
                            /* bağlantı hatası → hesap yönetimine düş */
                        }
                    }
                }
            }

            // Minimum splash süresini tamamla
            const elapsed = Date.now() - mountedAtRef.current;
            const remaining = Math.max(0, MIN_SPLASH_MS - elapsed);
            if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

            if (!cancelled) replace(target);
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [initialized]);

    return (
        <div className="bg-app-gradient h-full w-full flex flex-col items-center justify-center gap-10">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32 }}>
                {/* Logo — splash'ta %50 büyütüldü (160 -> 240) */}
                <div style={{
                    filter: 'drop-shadow(0 0 40px rgba(var(--theme-accent-rgb),0.55)) drop-shadow(0 4px 24px rgba(0,0,0,0.7))',
                    animation: 'splashLogoIn 0.7s ease-out both',
                }}>
                    <Logo height={240} />
                </div>
                <Spinner size={44} />
            </div>
            <style>{`
                @keyframes splashLogoIn {
                    from { opacity: 0; transform: scale(0.85) translateY(16px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
