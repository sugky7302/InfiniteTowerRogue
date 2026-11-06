import { localSignal } from "../rxwc3/signal";
import { I18nNatives, wc3I18nNatives } from "./natives";
import { Locale, localeFromClient } from "./locale";
import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";
import { Messages, TranslationKey, zhTW } from "./locales/zh-TW";
import { LocalFileIo } from "../file-io";
import { readLanguagePreference, writeLanguagePreference } from "./preference";

export type Params = Readonly<Record<string, string | number>>;

// 逐段替換，不把參數中的括號再次解析，也不使用 Lua 不支援的正規表示式。
function interpolate(text: string, params?: Params): string {
    let result = "";
    let cursor = 0;
    while (cursor < text.length) {
        const start = text.indexOf("{", cursor);
        if (start < 0) return result + text.slice(cursor);
        const end = text.indexOf("}", start + 1);
        if (end < 0) return result + text.slice(cursor);
        const name = text.slice(start + 1, end);
        const value = params?.[name];
        result +=
            text.slice(cursor, start) +
            (value === undefined ? text.slice(start, end + 1) : `${value}`);
        cursor = end + 1;
    }
    return result;
}

/** 翻譯只供顯示。不得用翻譯文字決定同步遊戲邏輯。 */
export function createI18n(
    natives: Pick<I18nNatives, "getLocale"> = wc3I18nNatives,
    files?: LocalFileIo,
) {
    const rawLocale = natives.getLocale();
    const preference = files === undefined ? undefined : readLanguagePreference(files);
    const language = localSignal<Locale>(preference?.locale ?? localeFromClient(rawLocale));
    const tables: Record<Locale, Messages> = { "zh-TW": zhTW, "zh-CN": zhCN, "en-US": enUS };
    const t = (key: TranslationKey, params?: Params): string =>
        interpolate(tables[language()][key], params);
    const selectLanguage = (locale: Locale) => {
        language.set(locale);
        return files === undefined ? undefined : writeLanguagePreference(files, locale);
    };
    return { rawLocale, language, t, preference, selectLanguage };
}

export type I18n = ReturnType<typeof createI18n>;
let current: I18n | undefined;
/** 首次使用才讀取原生語言。Node 測試可直接建立獨立服務。 */
export function getI18n(files?: LocalFileIo): I18n {
    return current ?? (current = createI18n(wc3I18nNatives, files));
}
export function t(key: TranslationKey, params?: Params): string {
    return getI18n().t(key, params);
}
