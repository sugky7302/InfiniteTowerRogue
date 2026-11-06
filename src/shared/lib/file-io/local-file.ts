import { FileNatives } from "@shared/lib/wc3-def";
import { logger } from "@shared/lib/logger";
import { decodeFileData, encodeFileData } from "./codec";
import {
    escapeFileData,
    unescapeFileData,
    FILE_ABILITY,
    FILE_PRELOAD_LIMIT,
    FILE_PRELOAD_START,
    FILE_PRELOAD_END,
} from "./preload";

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

/** 回傳的方法只供本地資料使用，不建立原生資源。 */
export function createLocalFileIo(natives: FileNatives) {
    return {
        read(path: string): FileRead {
            if (!safePath(path)) return { status: FileReadStatus.InvalidPath };
            let saved: string | undefined;
            try {
                saved = natives.getIcon(FILE_ABILITY);
            } catch (error) {
                logger.error(error);
                return { status: FileReadStatus.Failed };
            }
            if (saved === undefined) return { status: FileReadStatus.Missing };
            let raw: string | undefined;
            let failed = false;
            try {
                natives.setIcon("ITF-MISSING", FILE_ABILITY);
                natives.load(path);
                raw = natives.getIcon(FILE_ABILITY);
            } catch (error) {
                logger.error(error);
                failed = true;
            }
            try {
                natives.setIcon(saved, FILE_ABILITY);
            } catch (error) {
                logger.error(error);
                return { status: FileReadStatus.Failed };
            }
            if (failed) return { status: FileReadStatus.Failed };
            if (raw === undefined || raw === "ITF-MISSING")
                return { status: FileReadStatus.Missing };
            try {
                const data = decodeFileData(unescapeFileData(raw));
                return data === undefined
                    ? { status: FileReadStatus.InvalidData, rawLength: raw.length }
                    : { status: FileReadStatus.Read, data };
            } catch (error) {
                logger.error(error);
                return { status: FileReadStatus.Failed };
            }
        },
        write(path: string, data: string): FileWrite {
            if (!safePath(path)) return { status: FileWriteStatus.InvalidPath };
            const encoded = encodeFileData(data);
            if (encoded === undefined) return { status: FileWriteStatus.InvalidData };
            let result: FileWrite;
            try {
                natives.clear();
                natives.start();
                natives.emit(FILE_PRELOAD_START);
                const escaped = escapeFileData(encoded);
                for (let index = 0; index < escaped.length; index += FILE_PRELOAD_LIMIT)
                    natives.emit(escaped.slice(index, index + FILE_PRELOAD_LIMIT));
                natives.emit(FILE_PRELOAD_END);
                natives.finish(path);
                result = { status: FileWriteStatus.Issued };
            } catch (error) {
                logger.error(error);
                result = { status: FileWriteStatus.Failed };
            }
            try {
                natives.clear();
            } catch (error) {
                logger.error(error);
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
            } catch (error) {
                logger.error(error);
                result = { status: FileWriteStatus.Failed };
            }
            try {
                natives.clear();
            } catch (error) {
                logger.error(error);
                return { status: FileWriteStatus.Failed };
            }
            return result;
        },
    };
}

export type LocalFileIo = ReturnType<typeof createLocalFileIo>;
