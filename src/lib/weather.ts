import { httpJson } from './ipc';

/**
 * WeatherAPI.com istemcisi — anahtar panel config'den gelir;
 * yoksa hava durumu widget'ı gösterilmez.
 * Endpoint: https://api.weatherapi.com/v1/current.json
 */

const WEATHER_BASE = 'https://api.weatherapi.com/v1';

let apiKey = '';

export function configureWeather(key?: string): void {
    if (key) apiKey = key;
}

export function weatherReady(): boolean {
    return !!apiKey;
}

export function getWeatherApiKey(): string {
    return apiKey;
}

export interface WeatherCurrent {
    tempC: number;
    feelsLikeC: number;
    conditionCode: number;
    conditionText: string;
    iconUrl: string;      // WeatherAPI'den gelen ikon URL'si
    humidity: number;
    city: string;         // Şehir / il adı
    region: string;       // Bölge / il
    country: string;
    isDay: number;
}

/** weatherapi.com /current.json ham yanıtı */
interface WeatherApiResponse {
    location?: {
        name?: string;
        region?: string;
        country?: string;
    };
    current?: {
        temp_c?: number;
        feelslike_c?: number;
        humidity?: number;
        is_day?: number;
        condition?: {
            text?: string;
            code?: number;
            icon?: string;
        };
    };
}

// Uygulama açıldıktan sonra hava durumu yalnızca BİR kez çekilir ve burada
// önbelleğe alınır. Ekranlar arası geçişte (Dashboard remount) tekrar API'ye
// gidilmez; önbellekteki değer döner. Aynı anda birden çok çağrı gelirse de
// tek bir ağ isteği yapılır (in-flight dedup).
let cached: WeatherCurrent | null = null;
let inFlight: Promise<WeatherCurrent | null> | null = null;

async function requestWeather(): Promise<WeatherCurrent | null> {
    const url = `${WEATHER_BASE}/current.json?key=${apiKey}&q=auto:ip&lang=tr`;
    const data = await httpJson<WeatherApiResponse>(url, undefined, 8_000);
    if (!data?.location || !data?.current) return null;

    // //cdn.weatherapi.com/... şeklinde gelirse başına https: ekle
    let iconUrl = data.current.condition?.icon ?? '';
    if (iconUrl && iconUrl.startsWith('//')) {
        iconUrl = `https:${iconUrl}`;
    }

    return {
        tempC: data.current.temp_c ?? 0,
        feelsLikeC: data.current.feelslike_c ?? 0,
        conditionCode: data.current.condition?.code ?? 0,
        conditionText: data.current.condition?.text ?? '',
        iconUrl,
        humidity: data.current.humidity ?? 0,
        city: data.location.name ?? '',
        region: data.location.region ?? '',
        country: data.location.country ?? '',
        isDay: data.current.is_day ?? 1,
    };
}

/**
 * IP adresine göre ('auto:ip') anlık hava durumu çeker.
 * Uygulama oturumunda yalnızca BİR kez gerçek istek yapılır; sonraki çağrılar
 * önbellekten döner. API key set edilmemişse null döner.
 * @param force true verilirse önbellek atlanıp yeniden çekilir.
 */
export async function fetchWeather(force = false): Promise<WeatherCurrent | null> {
    if (!apiKey) return null;
    if (!force && cached) return cached;       // Önbellekten (ekran geçişlerinde yeni istek yok)
    if (!force && inFlight) return inFlight;    // Eşzamanlı çağrıları tek isteğe indir

    inFlight = requestWeather()
        .then((result) => {
            if (result) cached = result;        // Başarılıysa önbelleğe al
            return result;
        })
        .finally(() => {
            inFlight = null;
        });

    return inFlight;
}

/** Önbelleğe alınmış hava durumu (varsa) — anında, ağ isteği olmadan. */
export function getCachedWeather(): WeatherCurrent | null {
    return cached;
}
