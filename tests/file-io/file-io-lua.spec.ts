import { createLocalFileIo, decodeFileData, encodeFileData } from "../../src/shared/file-io";
import { createI18n } from "../../src/shared/i18n/translation";
import {
    decodeLanguagePreference,
    encodeLanguagePreference,
    languagePreferencePath,
} from "../../src/shared/i18n/preference";
import { fakeFileIo } from "./fake-file-io";
export { wc3FileNatives as natives } from "@shared/wc3-def";
export { createLocalFileIo } from "../../src/shared/file-io";

function check(value: boolean, message: string): void {
    if (!value) throw new Error(message);
}

/** Node 與 Lua 5.3 共用此流程。只測試本地資料，不改同步狀態。 */
export function verifyFileIo(): number {
    const fake = fakeFileIo();
    const files = createLocalFileIo(fake.natives);
    check(fake.prepares() === 1, "沒有預先建立資源。");
    check(decodeFileData(encodeFileData("ABC|123")!) === "ABC|123", "檔案編解碼錯誤。");
    check(decodeFileData("ITF1|3|ABC|1") === undefined, "未拒絕損壞內容。");
    check(
        decodeLanguagePreference(encodeLanguagePreference("en-US")) === "en-US" &&
            decodeLanguagePreference("ITR-LANG-1:fr-FR") === undefined,
        "偏好編解碼錯誤。",
    );
    const first = createI18n({ getLocale: () => "zhCN" }, files);
    check(
        first.preference?.result.status === "沒有檔案或無法讀取" && first.language() === "zh-CN",
        "無檔案後備錯誤。",
    );
    check(first.selectLanguage("en-US")?.status === "已送出，尚未確認磁碟寫入", "沒有送出寫檔。");
    const reopened = createI18n({ getLocale: () => "zhTW" }, files);
    check(
        reopened.language() === "en-US" &&
            reopened.t("example.ready") === "The language example is ready.",
        "重開沒有套用偏好。",
    );
    fake.files.set(languagePreferencePath, encodeFileData("錯誤") ?? "損壞");
    const damaged = createI18n({ getLocale: () => "enUS" }, files);
    check(
        damaged.language() === "en-US" && damaged.preference?.result.status === "內容錯誤",
        "錯誤偏好後備失敗。",
    );
    fake.failRead(true);
    check(
        files.read(languagePreferencePath).status === "讀取失敗" &&
            fake.getTooltip() === "原始提示",
        "讀取失敗未恢復提示。",
    );
    check(fake.prepares() === 1 && fake.writes() === 1, "本地操作重新建立資源。");
    return 10;
}
