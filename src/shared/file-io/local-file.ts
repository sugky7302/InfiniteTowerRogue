import { FileNatives } from "@shared/wc3-def";
import { decodeFileData, encodeFileData, fileSegmentCount, fileSegmentLength } from "./codec";

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
    | { status: typeof FileReadStatus.InvalidData; rawLength?: number }
    | {
          status: Exclude<
              FileReadStatus,
              typeof FileReadStatus.Read | typeof FileReadStatus.InvalidData
          >;
      };
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
export function createLocalFileIo(natives: FileNatives) {
    natives.prepare();
    return {
        read(path: string): FileRead {
            if (!safePath(path)) return { status: FileReadStatus.InvalidPath };
            const saved: string[] = [];
            try {
                for (let level = 0; level < fileSegmentCount; level++)
                    saved.push(natives.getTooltip(level));
            } catch {
                return { status: FileReadStatus.Failed };
            }
            let result: FileRead;
            try {
                natives.setTooltip("ITF-MISSING", 0);
                for (let level = 1; level < fileSegmentCount; level++)
                    natives.setTooltip("ITF-END", level);
                natives.load(path);
                let raw = "";
                for (let level = 0; level < fileSegmentCount; level++) {
                    const part = natives.getTooltip(level);
                    if (part === "ITF-END") break;
                    raw += part;
                }
                const data = decodeFileData(raw);
                result =
                    raw === "ITF-MISSING"
                        ? { status: FileReadStatus.Missing }
                        : data === undefined
                          ? { status: FileReadStatus.InvalidData, rawLength: raw.length }
                          : { status: FileReadStatus.Read, data };
            } catch {
                result = { status: FileReadStatus.Failed };
            }
            try {
                for (let level = 0; level < fileSegmentCount; level++)
                    natives.setTooltip(saved[level], level);
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
                // 每段最多 96 個 ASCII 字元，寫入自己的等級。連同注入語句仍小於 200 個位元組。
                // Preloader 執行時，BlzGetAbilityTooltip 串接不會生效，所以不串接。
                // 等級使用整數計數。Lua 的除法得到浮點數，轉成文字是 1.0，JASS 不接受。
                let level = 0;
                for (let index = 0; index < encoded.length; index += fileSegmentLength) {
                    natives.emit(
                        "\")\ncall BlzSetAbilityTooltip('A0IO',\"" +
                            encoded.slice(index, index + fileSegmentLength) +
                            '",' +
                            level +
                            ")\n//",
                    );
                    level++;
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
