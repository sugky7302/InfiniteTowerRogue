import { MAX_FILE_DATA_LENGTH } from "../../file-io/codec";

export type Fields = Record<string, string | number | boolean>;

/** Lua 資料表不保存 nil 欄位。建立資料表前先轉成明確的 na。 */
export function resultValue(
    value: string | number | boolean | undefined,
): string | number | boolean {
    return value === undefined ? "na" : value;
}

function safeToken(value: string): boolean {
    if (value.length === 0) return false;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 32 || code > 126 || ',;=|"\\'.indexOf(value.charAt(index)) >= 0) return false;
    }
    return true;
}

/** ASCII 欄位為資料協定識別符。說明文字放在文件與遊戲畫面。 */
export function formatRecord(fields: Fields): string {
    const parts: string[] = [];
    for (const key of Object.keys(fields)) {
        const raw = fields[key];
        const value = raw === undefined ? "na" : `${raw}`;
        if (!safeToken(key) || !safeToken(value)) throw new Error("基準結果含有不支援的欄位。");
        parts.push(`${key}=${value}`);
    }
    return parts.join(",");
}

export function parseRecords(data: string): Record<string, string>[] {
    if (data === "") return [];
    return data.split(";").map((record) => {
        const fields: Record<string, string> = {};
        for (const part of record.split(",")) {
            const index = part.indexOf("=");
            const key = part.slice(0, index);
            const value = part.slice(index + 1);
            if (index < 1 || !safeToken(key) || !safeToken(value) || fields[key] !== undefined)
                throw new Error("基準結果格式錯誤。");
            fields[key] = value;
        }
        return fields;
    });
}

/** 每筆記錄保持完整。首檔保存分檔總數，避免讀取舊的尾檔。 */
export function resultPages(records: readonly string[]): string[] {
    const pages: string[] = [];
    let current = "";
    for (const record of records) {
        if (record.length > MAX_FILE_DATA_LENGTH - 80)
            throw new Error("單筆基準結果超過檔案上限。");
        const next = current === "" ? record : `${current};${record}`;
        if (next.length > MAX_FILE_DATA_LENGTH - 80) {
            pages.push(current);
            current = record;
        } else current = next;
    }
    if (current !== "" || pages.length === 0) pages.push(current);
    return pages.map(
        (page, index) =>
            `${formatRecord({ schema: 1, page: index + 1, pages: pages.length })}${page === "" ? "" : ";" + page}`,
    );
}
