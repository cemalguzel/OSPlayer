/** window.osplayer köprüsüne tipli erişim + tarayıcıda (Electron dışı) zarif hata */

export function bridge(): OsPlayerBridge {
    if (typeof window !== 'undefined' && window.osplayer) return window.osplayer;
    throw new Error('Electron köprüsü yok — uygulama Electron içinde çalıştırılmalı');
}

export const isElectron = typeof window !== 'undefined' && !!window.osplayer;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * HTTP GET + JSON parse; 429 Too Many Requests alınırsa otomatik retry yapar.
 * maxRetries: kaç kez denensin (0 = sadece 1 kez). retryDelayMs: ilk bekleme süresi (ms).
 */
export async function httpJson<T>(
    url: string,
    headers?: Record<string, string>,
    timeoutMs?: number,
    maxRetries = 2,
    retryDelayMs = 6_000
): Promise<T | null> {
    // Geçici hatalar (rate-limit, servis yok) — tekrar denenebilir
    const RETRYABLE = new Set([429, 502, 503, 504]);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await bridge().http.request({ url, headers, responseType: 'json', timeoutMs });

        // Başarılı
        if (res.ok && res.body != null) return res.body as T;

        // Geçici hata → bekle ve tekrar dene
        if (RETRYABLE.has(res.status) && attempt < maxRetries) {
            const wait = retryDelayMs * (attempt + 1); // 6s, 12s, ...
            console.warn(`[HTTP] ${res.status} hatası — ${wait / 1000}s sonra tekrar denenecek: ${url}`);
            await sleep(wait);
            continue;
        }

        // Kalıcı hata (404, 403, 500 vb.) — hemen vazgeç
        if (res.status !== 200) {
            console.warn(`[HTTP] ${res.status} hatası (kalıcı): ${url}`);
        }
        return null;
    }
    return null;
}

export async function httpPostJson<T>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
    timeoutMs?: number
): Promise<T | null> {
    const defaultHeaders = { 'Content-Type': 'application/json', ...headers };
    const res = await bridge().http.request({ 
        url, 
        method: 'POST', 
        body: JSON.stringify(body), 
        headers: defaultHeaders, 
        responseType: 'json', 
        timeoutMs 
    });
    if (!res.ok || res.body == null) return null;
    return res.body as T;
}

export async function storeGet<T>(key: string, fallback: T): Promise<T> {
    try {
        const v = await bridge().store.get(key);
        return (v as T) ?? fallback;
    } catch {
        return fallback;
    }
}

export async function storeSet(key: string, value: unknown): Promise<void> {
    try {
        await bridge().store.set(key, value);
    } catch {
        /* yoksay */
    }
}
