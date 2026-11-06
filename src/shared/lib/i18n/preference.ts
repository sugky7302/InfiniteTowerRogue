import { LocalFileIo, FileRead, FileWrite, FileReadStatus } from "../file-io";
import { isLocale, Locale } from "./locale";

export const languagePreferencePath = "InfiniteTowerRogue\\language.pld";
export function encodeLanguagePreference(locale: Locale): string {
    return "ITR-LANG-1:" + locale;
}
export function decodeLanguagePreference(value: string): Locale | undefined {
    if (value.slice(0, 11) !== "ITR-LANG-1:") return undefined;
    const code = value.slice(11);
    return isLocale(code) ? code : undefined;
}

/** 結果只能寫入本地語言 Signal，不得用於同步狀態。 */
export function readLanguagePreference(files: LocalFileIo): { result: FileRead; locale?: Locale } {
    const result = files.read(languagePreferencePath);
    if (result.status !== FileReadStatus.Read) return { result };
    const locale = decodeLanguagePreference(result.data);
    return locale === undefined
        ? { result: { status: FileReadStatus.InvalidData } }
        : { result, locale };
}
export function writeLanguagePreference(files: LocalFileIo, locale: Locale): FileWrite {
    return files.write(languagePreferencePath, encodeLanguagePreference(locale));
}
