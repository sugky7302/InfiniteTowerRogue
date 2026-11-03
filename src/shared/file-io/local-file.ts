import { FileIoNatives } from "../wc3-def/file-io-natives";
import { decodeFileData, encodeFileData } from "./codec";

export const FileReadStatus = {
    Read: "已讀取",
    Missing: "沒有檔案或無法讀取",
    InvalidData: "內容錯誤",
    Failed: "讀取失敗",
    InvalidPath: "路徑錯誤",
} as const;
export type FileReadStatus = (typeof FileReadStatus)[keyof typeof FileReadStatus];
export const FileWriteStatus = {
    Issued: "已送出，尚未確認磁碟寫入",
    InvalidData: "內容錯誤",
    Failed: "寫入失敗",
    InvalidPath: "路徑錯誤",
} as const;
export type FileWriteStatus = (typeof FileWriteStatus)[keyof typeof FileWriteStatus];

export type FileRead =
    | { status: typeof FileReadStatus.Read; data: string }
    | { status: Exclude<FileReadStatus, typeof FileReadStatus.Read> };
export type FileWrite = {
    status: FileWriteStatus;
};

function safePath(path: string): boolean {
    if (path.length < 1 || path.length > 120) return false;
    const parts = path.split("\\");
    const allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
    for (const part of parts) {
        if (part === "" || part === "." || part === "..") return false;
        for (let index = 0; index < part.length; index++)
            if (allowed.indexOf(part.charAt(index)) < 0) return false;
    }
    return true;
}

/** 建立時須在共同流程預載資源。回傳的方法只供本地顯示資料使用。 */
export function createLocalFileIo(natives: FileIoNatives) {
    natives.prepare();
    return {
        read(path: string): FileRead {
            if (!safePath(path)) return { status: FileReadStatus.InvalidPath };
            let saved: string;
            try {
                saved = natives.getTooltip();
            } catch {
                return { status: FileReadStatus.Failed };
            }
            let result: FileRead;
            try {
                natives.setTooltip("ITF-MISSING");
                natives.load(path);
                const raw = natives.getTooltip();
                const data = decodeFileData(raw);
                result =
                    raw === "ITF-MISSING"
                        ? { status: FileReadStatus.Missing }
                        : data === undefined
                          ? { status: FileReadStatus.InvalidData }
                          : { status: FileReadStatus.Read, data };
            } catch {
                result = { status: FileReadStatus.Failed };
            }
            try {
                natives.setTooltip(saved);
            } catch {
                return { status: FileReadStatus.Failed };
            }
            return result;
        },
        write(path: string, data: string): FileWrite {
            if (!safePath(path)) return { status: FileWriteStatus.InvalidPath };
            const encoded = encodeFileData(data);
            if (encoded === undefined) return { status: FileWriteStatus.InvalidData };
            let result: FileWrite;
            try {
                natives.clear();
                natives.start();
                // 每段最多 96 個 ASCII 字元。連同注入語句仍小於 200 個位元組。
                for (let index = 0; index < encoded.length; index += 96) {
                    // 第一段直接設定非空框架，不依賴引擎是否接受空提示。
                    const before = index === 0 ? "" : "BlzGetAbilityTooltip('A0IO',0)+";
                    natives.emit(
                        "\")\ncall BlzSetAbilityTooltip('A0IO'," +
                            before +
                            '"' +
                            encoded.slice(index, index + 96) +
                            '\",0)\n//',
                    );
                }
                natives.emit('\")\nendfunction\nfunction a takes nothing returns nothing\n//');
                natives.finish(path);
                result = { status: FileWriteStatus.Issued };
            } catch {
                result = { status: FileWriteStatus.Failed };
            }
            try {
                natives.clear();
            } catch {
                return { status: FileWriteStatus.Failed };
            }
            return result;
        },
        /** 每條受限 ASCII 文字完整寫成註解行，方便玩家從實體檔案複製。 */
        writeReadable(path: string, lines: readonly string[]): FileWrite {
            if (!safePath(path)) return { status: FileWriteStatus.InvalidPath };
            if (
                lines.length < 1 ||
                encodeFileData(lines.join(" ")) === undefined ||
                lines.some((line) => line.length < 1 || line.length > 126)
            )
                return { status: FileWriteStatus.InvalidData };
            let result: FileWrite;
            try {
                natives.clear();
                natives.start();
                // 結束 Preload 字串後寫入註解。輸入已排除引號、反斜線與換行。
                for (const line of lines) natives.emit('\")\n// ' + line + "\n//");
                natives.finish(path);
                result = { status: FileWriteStatus.Issued };
            } catch {
                result = { status: FileWriteStatus.Failed };
            }
            try {
                natives.clear();
            } catch {
                return { status: FileWriteStatus.Failed };
            }
            return result;
        },
    };
}

export type LocalFileIo = ReturnType<typeof createLocalFileIo>;
