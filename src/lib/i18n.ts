import { useAppStore } from '../store/appStore';
import { TRANSLATIONS } from './translations';

/** Desteklenen arayüz dilleri */
export type Lang = 'tr' | 'en' | 'de' | 'fr' | 'es' | 'pt';

/** Dil seçici listesi (her dil kendi adıyla gösterilir) */
export const LANGUAGES: { code: Lang; label: string }[] = [
    { code: 'tr', label: 'Türkçe' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'es', label: 'Español' },
    { code: 'pt', label: 'Português' },
];

/**
 * Bir Türkçe kaynak metni (key) verilen dile çevirir.
 * - Dil 'tr' ise ya da çeviri yoksa kaynağın kendisi döner (graceful fallback).
 * - vars verilirse `{ad}` biçimindeki yer tutucular değerleriyle değiştirilir.
 */
export function translate(
    lang: string,
    key: string,
    vars?: Record<string, string | number>,
): string {
    let out = key;
    if (lang && lang !== 'tr') {
        const dict = TRANSLATIONS[lang as Lang];
        const hit = dict ? dict[key] : undefined;
        if (hit != null && hit !== '') out = hit;
    }
    if (vars) {
        for (const k of Object.keys(vars)) {
            out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
        }
    }
    return out;
}

/**
 * Bileşen içi çeviri hook'u. Aktif dili store'dan okur; dil değişince
 * t() kullanan tüm bileşenler otomatik yeniden render olur.
 *
 *   const t = useT();
 *   <span>{t('Ayarlar')}</span>
 *   <span>{t('{n} kanal', { n: count })}</span>
 */
export function useT() {
    const lang = useAppStore((s) => s.settings.language);
    return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
