import ko from "./locales/ko.json";
import en from "./locales/en.json"

type TranslationKey = keyof typeof ko;

const locales = {
    ko,
    en,
} as const;

export type Language = keyof typeof locales;

let current_language: Language = "ko";

export function set_language(language: Language) {
    current_language = language;
}

export function is_valid_locale(key: string): key is TranslationKey {
    return Object.hasOwn(locales[current_language], key);
}

export function locale(
    key: TranslationKey,
    params?: Record<string, string | number>
): string {
    let text = locales[current_language][key] ?? key;

    if (params) {
        for (const [k, v] of Object.entries(params)) {
            text = text.replaceAll(`{${k}}`, String(v));
        }
    }

    return text;
}