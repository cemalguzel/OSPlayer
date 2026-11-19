import { httpJson } from './ipc';

/** TMDB istemcisi — anahtar panel config'den gelir; yoksa TMDB özellikleri atlanır. */
const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p';

let apiKey = '';
let language = 'tr';
let enabled = true; // Ayarlar → TMDB API → "TMDB'den Verileri Al" anahtarı

/** TMDB veri dili seçenekleri — kod, yerel ad ve TMDB `language` paramı (locale).
 *  Mantık (ornek-lg-webos.js getTmdbLangQuery uyarlaması): seçilen dil önceliklidir;
 *  o dilde bilgi/görsel yoksa TMDB İngilizce'ye (en) düşer. */
export interface TmdbLanguage {
    code: string;
    native: string;
    locale: string;
}

export const TMDB_LANGUAGES: TmdbLanguage[] = [
    { code: 'tr', native: 'Türkçe', locale: 'tr-TR' },
    { code: 'en', native: 'English', locale: 'en-US' },
    { code: 'de', native: 'Deutsch', locale: 'de-DE' },
    { code: 'fr', native: 'Français', locale: 'fr-FR' },
    { code: 'es', native: 'Español', locale: 'es-ES' },
    { code: 'it', native: 'Italiano', locale: 'it-IT' },
    { code: 'pt', native: 'Português', locale: 'pt-PT' },
    { code: 'ru', native: 'Русский', locale: 'ru-RU' },
    { code: 'ar', native: 'العربية', locale: 'ar-SA' },
    { code: 'ja', native: '日本語', locale: 'ja-JP' },
    { code: 'ko', native: '한국어', locale: 'ko-KR' },
    { code: 'zh', native: '普通话', locale: 'zh-CN' },
    { code: 'cn', native: '广州话', locale: 'zh-CN' },
    { code: 'hi', native: 'हिन्दी', locale: 'hi-IN' },
    { code: 'pl', native: 'Polski', locale: 'pl-PL' },
    { code: 'nl', native: 'Nederlands', locale: 'nl-NL' },
    { code: 'sv', native: 'svenska', locale: 'sv-SE' },
    { code: 'da', native: 'Dansk', locale: 'da-DK' },
    { code: 'no', native: 'Norsk', locale: 'nb-NO' },
    { code: 'nb', native: 'Bokmål', locale: 'nb-NO' },
    { code: 'fi', native: 'suomi', locale: 'fi-FI' },
    { code: 'cs', native: 'Český', locale: 'cs-CZ' },
    { code: 'sk', native: 'Slovenčina', locale: 'sk-SK' },
    { code: 'hu', native: 'Magyar', locale: 'hu-HU' },
    { code: 'ro', native: 'Română', locale: 'ro-RO' },
    { code: 'bg', native: 'български', locale: 'bg-BG' },
    { code: 'uk', native: 'Український', locale: 'uk-UA' },
    { code: 'el', native: 'ελληνικά', locale: 'el-GR' },
    { code: 'he', native: 'עברית', locale: 'he-IL' },
    { code: 'fa', native: 'فارسی', locale: 'fa-IR' },
    { code: 'th', native: 'ไทย', locale: 'th-TH' },
    { code: 'vi', native: 'Tiếng Việt', locale: 'vi-VN' },
    { code: 'id', native: 'Bahasa Indonesia', locale: 'id-ID' },
    { code: 'ms', native: 'Bahasa Melayu', locale: 'ms-MY' },
    { code: 'ca', native: 'Català', locale: 'ca-ES' },
    { code: 'hr', native: 'Hrvatski', locale: 'hr-HR' },
    { code: 'sr', native: 'Српски', locale: 'sr-RS' },
    { code: 'sl', native: 'Slovenščina', locale: 'sl-SI' },
    { code: 'sq', native: 'Shqip', locale: 'sq-AL' },
    { code: 'bs', native: 'Bosanski', locale: 'bs-BA' },
    { code: 'lt', native: 'Lietuvių', locale: 'lt-LT' },
    { code: 'lv', native: 'Latviešu', locale: 'lv-LV' },
    { code: 'et', native: 'Eesti', locale: 'et-EE' },
    { code: 'is', native: 'Íslenska', locale: 'is-IS' },
    { code: 'ga', native: 'Gaeilge', locale: 'ga-IE' },
    { code: 'eu', native: 'Euskara', locale: 'eu-ES' },
    { code: 'gl', native: 'Galego', locale: 'gl-ES' },
    { code: 'af', native: 'Afrikaans', locale: 'af-ZA' },
    { code: 'bn', native: 'বাংলা', locale: 'bn-BD' },
    { code: 'ta', native: 'தமிழ்', locale: 'ta-IN' },
    { code: 'te', native: 'తెలుగు', locale: 'te-IN' },
    { code: 'ml', native: 'മലയാളം', locale: 'ml-IN' },
    { code: 'ur', native: 'اردو', locale: 'ur-PK' },
    { code: 'az', native: 'Azərbaycan', locale: 'az-AZ' },
    { code: 'ka', native: 'ქართული', locale: 'ka-GE' },
    { code: 'kk', native: 'Қазақ', locale: 'kk-KZ' },
    { code: 'mk', native: 'Македонски', locale: 'mk-MK' },
    { code: 'mn', native: 'Монгол', locale: 'mn-MN' },
    { code: 'pa', native: 'ਪੰਜਾਬੀ', locale: 'pa-IN' },
    { code: 'sw', native: 'Kiswahili', locale: 'sw-KE' },
    { code: 'uz', native: 'Oʻzbek', locale: 'uz-UZ' },
    { code: 'be', native: 'Беларуская', locale: 'be-BY' },
    { code: 'cy', native: 'Cymraeg', locale: 'cy-GB' },
    { code: 'mt', native: 'Malti', locale: 'mt-MT' },
];

const LANG_LOCALE: Record<string, string> = Object.fromEntries(
    TMDB_LANGUAGES.map((l) => [l.code, l.locale]),
);

export function configureTmdb(key?: string, lang?: string): void {
    if (key) apiKey = key;
    if (lang) language = lang;
}

/** Kullanıcı ayarından TMDB kullanımını aç/kapat. Kapalıyken tmdbReady() false döner
 *  → film/dizi detayları yalnızca Xtream API'den alınır. */
export function setTmdbEnabled(on: boolean): void {
    enabled = on;
}

export function tmdbReady(): boolean {
    return enabled && !!apiKey;
}

export interface TmdbDetails {
    id?: number;
    title?: string;
    name?: string;
    overview?: string;
    backdrop_path?: string;
    poster_path?: string;
    vote_average?: number;
    release_date?: string;
    first_air_date?: string;
    runtime?: number;
    genres?: Array<{ name: string }>;
    credits?: {
        cast?: Array<{ name: string; character?: string; profile_path?: string | null }>;
        crew?: Array<{ name: string; job?: string }>;
    };
    videos?: { results?: Array<{ key: string; name?: string; site?: string; type?: string }> };
    images?: {
        backdrops?: Array<{ file_path: string }>;
        logos?: Array<{ file_path: string; iso_639_1?: string | null; vote_average?: number }>;
    };
}


/** Seçili dile göre TMDB `language` + görsel dil fallback sorgusu.
 *  Örnek (ornek-lg-webos.js): seçilen dil locale'i + `include_image_language=<dil>,en,null`,
 *  böylece seçili dilde bilgi/logo yoksa İngilizce (en), o da yoksa dilsiz görsel kullanılır. */
function langQuery(l: string): string {
    const locale = LANG_LOCALE[l] ?? `${l}-${l.toUpperCase()}`;
    if (l === 'en') return `&language=en-US&include_image_language=en,null`;
    return `&language=${locale}&include_image_language=${l},en,null`;
}

function url(path: string, l: string): string {
    // images + include_image_language → isim/başlık logolarını (logos) da getir.
    return `${TMDB_BASE}${path}?api_key=${apiKey}${langQuery(l)}&append_to_response=credits,videos,images`;
}

/** TMDB detayını seçili dilde getirir; özet/başlık o dilde BOŞ dönerse İngilizce'den
 *  ikinci istekle metin alanlarını doldurur. `include_image_language` yalnızca görselleri
 *  İngilizce'ye düşürür; overview/title gibi metinler için TMDB otomatik fallback yapmaz,
 *  bu yüzden burada elle yapıyoruz. Böylece "seçili dilde bilgi yoksa İngilizce" sözü
 *  metinler için de gerçekleşir (en son çare olarak çağıran kod Xtream verisine düşer). */
async function fetchDetails(path: string): Promise<TmdbDetails | null> {
    const l = language || 'en';
    const primary = await httpJson<TmdbDetails>(url(path, l), undefined, 10_000);
    if (!primary) return null;
    // Seçili dil İngilizce değilse ve özet boşsa → İngilizce metinlerle tamamla.
    if (l !== 'en' && !primary.overview?.trim()) {
        const en = await httpJson<TmdbDetails>(url(path, 'en'), undefined, 10_000).catch(() => null);
        if (en) {
            if (!primary.overview?.trim()) primary.overview = en.overview;
            if (!primary.title?.trim()) primary.title = en.title;
            if (!primary.name?.trim()) primary.name = en.name;
        }
    }
    return primary;
}

export async function tmdbMovie(id: string | number): Promise<TmdbDetails | null> {
    if (!tmdbReady()) return null;
    return fetchDetails(`/movie/${id}`);
}

export async function tmdbTv(id: string | number): Promise<TmdbDetails | null> {
    if (!tmdbReady()) return null;
    return fetchDetails(`/tv/${id}`);
}

export function tmdbImage(path?: string | null, size = 'w780'): string | null {
    if (!path) return null;
    return `${TMDB_IMG}/${size}${path}`;
}

/** Film/dizi adının logo (isim) görseli — varsa düz metin başlık yerine kullanılır.
 *  Önce kullanıcı dili (tr), sonra İngilizce, sonra dilsiz logo seçilir; aynı dilde
 *  oy ortalaması en yüksek olan tercih edilir. Logo yoksa null döner. */
export function tmdbLogo(d?: TmdbDetails | null, size = 'w500'): string | null {
    const logos = d?.images?.logos ?? [];
    if (!logos.length) return null;
    const byLang = (lang: string | null) =>
        logos
            .filter((l) => (l.iso_639_1 ?? null) === lang && l.file_path)
            .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))[0];
    const pick = byLang(language) ?? byLang('en') ?? byLang(null) ?? logos[0];
    return pick?.file_path ? `${TMDB_IMG}/${size}${pick.file_path}` : null;
}

export function youtubeTrailerKey(d?: TmdbDetails | null): string | null {
    const vids = d?.videos?.results ?? [];
    const t = vids.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ?? vids.find((v) => v.site === 'YouTube');
    return t?.key ?? null;
}
