import {
    createLocalFileIo,
    decodeFileData,
    encodeFileData,
    escapeFileData,
    unescapeFileData,
    fileAbility,
    FileReadStatus,
    FileWriteStatus,
} from "../../src/shared/lib/file-io";
import { createI18n } from "../../src/shared/lib/i18n/translation";
import {
    decodeLanguagePreference,
    encodeLanguagePreference,
    languagePreferencePath,
} from "../../src/shared/lib/i18n/preference";
import { fakeFileIo, framedFile, loadedIcon } from "./fake-file-io";
export { wc3FileNatives as natives } from "@shared/lib/wc3-def";
export { createLocalFileIo, escapeFileData, unescapeFileData } from "../../src/shared/lib/file-io";

/** Node 與 Lua 共用此流程。只測試本地資料，不改同步狀態。 */
export function verifyFileIo(): number {
    let count = 0;
    const check = (value: boolean, message: string): void => {
        if (!value) throw new Error(message);
        count++;
    };
    const fake = fakeFileIo();
    const files = createLocalFileIo(fake.natives);
    check(decodeFileData(encodeFileData("ABC|123")!) === "ABC|123", "檔案編解碼錯誤。");
    check(decodeFileData("ITF1|3|ABC|1") === undefined, "未拒絕損壞內容。");
    check(
        decodeLanguagePreference(encodeLanguagePreference("en-US")) === "en-US" &&
            decodeLanguagePreference("ITR-LANG-1:fr-FR") === undefined,
        "偏好編解碼錯誤。",
    );
    const first = createI18n({ getLocale: () => "zhCN" }, files);
    check(
        first.preference?.result.status === FileReadStatus.Missing && first.language() === "zh-CN",
        "無檔案後備錯誤。",
    );
    check(first.selectLanguage("en-US")?.status === FileWriteStatus.Issued, "沒有送出寫檔。");
    const reopened = createI18n({ getLocale: () => "zhTW" }, files);
    check(
        reopened.language() === "en-US" &&
            reopened.t("example.ready") === "The language example is ready.",
        "重開沒有套用偏好。",
    );
    fake.setData(languagePreferencePath, "損壞");
    const damaged = createI18n({ getLocale: () => "enUS" }, files);
    check(
        damaged.language() === "en-US" &&
            damaged.preference?.result.status === FileReadStatus.InvalidData,
        "錯誤偏好後備失敗。",
    );
    const invalid = files.read(languagePreferencePath);
    check(
        invalid.status === FileReadStatus.InvalidData && invalid.rawLength === "損壞".length,
        "損壞內容長度錯誤。",
    );
    check(fake.getIcon() === "原始圖示", "內容錯誤未還原圖示。");
    const payload = "A".repeat(4096);
    check(
        files.write("full.pld", payload).status === FileWriteStatus.Issued,
        "4096 字元寫入失敗。",
    );
    const full = files.read("full.pld");
    check(full.status === FileReadStatus.Read && full.data === payload, "4096 字元讀回失敗。");
    check(fake.getIcon() === "原始圖示", "成功讀取未還原圖示。");
    check(
        fake.outputs.get("full.pld")!.every((line) => line.length <= 259),
        "單次 emit 超過 259 字元。",
    );
    check(fileAbility === 1097690227 && fileAbility <= 2147483647, "載體整數錯誤。");
    const esc = String.fromCharCode(27);
    const special = esc + 'q"' + esc + esc + '"' + "A".repeat(258) + esc + "q";
    check(unescapeFileData(escapeFileData(special)) === special, "ESC 與雙引號往返錯誤。");
    check(escapeFileData(esc + '"') === esc + esc + esc + "q", "跳脫格式與 w3ts 不同。");
    fake.natives.setIcon("", fileAbility);
    check(
        files.read("missing.pld").status === FileReadStatus.Missing && fake.getIcon() === "",
        "遺失檔案或空圖示還原錯誤。",
    );
    fake.files.set("old.pld", "call BlzSetAbilityTooltip('A0IO',\"ITF1|3|ABC|1\",0)");
    check(files.read("old.pld").status === FileReadStatus.Missing, "舊格式未安全拒絕。");
    fake.natives.setIcon("原始圖示", fileAbility);
    fake.failRead(true);
    check(
        files.read(languagePreferencePath).status === FileReadStatus.Failed &&
            fake.getIcon() === "原始圖示",
        "讀取例外未還原圖示。",
    );
    fake.natives.load = () => {
        fake.natives.setIcon("部分資料", fileAbility);
        throw new Error("測試載入中斷。");
    };
    check(
        files.read("full.pld").status === FileReadStatus.Failed && fake.getIcon() === "原始圖示",
        "載入中斷未還原圖示。",
    );
    const across = "A".repeat(258) + esc + 'q"' + esc;
    const reassembled = loadedIcon(framedFile(across));
    check(
        reassembled !== undefined && unescapeFileData(reassembled) === across,
        "跨 259 字元邊界的跳脫對錯誤。",
    );
    const missingIcon = fakeFileIo();
    missingIcon.natives.getIcon = () => undefined;
    check(
        createLocalFileIo(missingIcon.natives).read("slot.pld").status === FileReadStatus.Missing,
        "沒有圖示時未回報遺失。",
    );
    const emptyIcon = fakeFileIo();
    emptyIcon.natives.load = () => emptyIcon.natives.setIcon("", fileAbility);
    const empty = createLocalFileIo(emptyIcon.natives).read("slot.pld");
    check(
        empty.status === FileReadStatus.InvalidData &&
            empty.rawLength === 0 &&
            emptyIcon.getIcon() === "原始圖示",
        "空內容未保留零長度或還原圖示。",
    );
    const failedGet = fakeFileIo();
    const get = failedGet.natives.getIcon;
    let reads = 0;
    failedGet.natives.getIcon = (ability) => {
        reads++;
        if (reads === 2) throw new Error("測試圖示讀取錯誤。");
        return get(ability);
    };
    check(
        createLocalFileIo(failedGet.natives).read("slot.pld").status === FileReadStatus.Failed &&
            failedGet.getIcon() === "原始圖示",
        "圖示讀取例外未還原。",
    );
    failedGet.natives.getIcon = () => {
        throw new Error("測試原始圖示讀取錯誤。");
    };
    check(
        createLocalFileIo(failedGet.natives).read("slot.pld").status === FileReadStatus.Failed,
        "原始圖示讀取例外未回報失敗。",
    );
    const failedSet = fakeFileIo();
    const set = failedSet.natives.setIcon;
    let sets = 0;
    failedSet.natives.setIcon = (text, ability) => {
        sets++;
        set(text, ability);
        if (sets === 1) throw new Error("測試圖示設定錯誤。");
    };
    check(
        createLocalFileIo(failedSet.natives).read("slot.pld").status === FileReadStatus.Failed &&
            failedSet.getIcon() === "原始圖示",
        "設定標記例外未還原。",
    );
    const unreadable = fakeFileIo();
    unreadable.natives.load = () => {
        unreadable.natives.getIcon = () => undefined;
    };
    check(
        createLocalFileIo(unreadable.natives).read("slot.pld").status === FileReadStatus.Missing,
        "載入後沒有圖示時未回報遺失。",
    );
    const damagedEscape = fakeFileIo();
    damagedEscape.setData("slot.pld", esc + '"');
    const invalidEscape = createLocalFileIo(damagedEscape.natives).read("slot.pld");
    check(
        invalidEscape.status === FileReadStatus.InvalidData && invalidEscape.rawLength === 4,
        "rawLength 未保留反跳脫前的長度。",
    );
    return count;
}
