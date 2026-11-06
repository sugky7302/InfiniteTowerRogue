import { FileNatives } from "@shared/lib/wc3-def";
import {
    escapeFileData,
    FILE_ABILITY,
    FILE_PRELOAD_END,
    FILE_PRELOAD_LIMIT,
    FILE_PRELOAD_START,
    unescapeFileData,
} from "../../src/shared/lib/file-io";

/** 模擬 PreloadGenEnd 的文字包裝。注入行會產生內嵌 Lua 區塊。 */
export function preloadFile(lines: readonly string[]): string {
    return (
        "function PreloadFiles takes nothing returns nothing\n" +
        lines.map((line) => '    call Preload( "' + line + '" )').join("\n") +
        "\n    call PreloadEnd( 0.0 )\nendfunction\n"
    );
}

/** 測試資料也使用新檔案格式。傳入未跳脫的框架，可包含損壞內容。 */
export function framedFile(raw: string): string {
    const escaped = escapeFileData(raw);
    const lines = [FILE_PRELOAD_START];
    for (let index = 0; index < escaped.length; index += FILE_PRELOAD_LIMIT)
        lines.push(escaped.slice(index, index + FILE_PRELOAD_LIMIT));
    lines.push(FILE_PRELOAD_END);
    return preloadFile(lines);
}

/** 只模擬本模組的內嵌 Lua，不執行任意程式。不得使用正規表示式。 */
export function loadedIcon(source: string): string | undefined {
    let accumulating = false;
    let userCode = false;
    let output = "";
    for (const physical of source.split("\n")) {
        const line = physical.trim();
        if (line === "//! beginusercode") userCode = true;
        else if (line === "//!endusercode") userCode = false;
        else if (userCode && line === "local o=''") output = "";
        else if (userCode && line === "Preload=function(s)o=o..s end") accumulating = true;
        else if (userCode && line === `BlzSetAbilityIcon(${FILE_ABILITY},o)` && accumulating)
            return output;
        else if (!userCode && accumulating) {
            const head = 'call Preload( "';
            const tail = '" )';
            if (line.indexOf(head) === 0 && line.slice(-tail.length) === tail)
                output += line.slice(head.length, line.length - tail.length);
        }
    }
    return undefined;
}

/** 模擬新格式的累加與圖示寫入，不模擬磁碟權限或遊戲快取。 */
export function fakeFileIo() {
    const files = new Map<string, string>();
    const outputs = new Map<string, string[]>();
    const lines: string[] = [];
    const icons = new Map<number, string>();
    let writes = 0;
    let failRead = false;
    let failWrite = false;
    const natives: FileNatives = {
        getIcon: (ability) => icons.get(ability) ?? "原始圖示",
        setIcon: (value, ability) => {
            icons.set(ability, value);
        },
        clear: () => {
            lines.length = 0;
        },
        start: () => {},
        emit: (line) => {
            lines.push(line);
        },
        finish(path) {
            if (failWrite) throw new Error("測試寫入錯誤。");
            files.set(path, preloadFile(lines));
            outputs.set(path, [...lines]);
            writes++;
        },
        load(path) {
            if (failRead) throw new Error("測試讀取錯誤。");
            const source = files.get(path);
            if (source === undefined) return;
            const value = loadedIcon(source);
            if (value !== undefined) icons.set(FILE_ABILITY, value);
        },
    };
    return {
        natives,
        files,
        outputs,
        lines,
        setData: (path: string, raw: string) => {
            files.set(path, framedFile(raw));
        },
        getData: (path: string) => {
            const source = files.get(path);
            const value = source === undefined ? undefined : loadedIcon(source);
            return value === undefined ? undefined : unescapeFileData(value);
        },
        getIcon: () => natives.getIcon(FILE_ABILITY),
        writes: () => writes,
        failRead: (value: boolean) => {
            failRead = value;
        },
        failWrite: (value: boolean) => {
            failWrite = value;
        },
    };
}
