import { FileNatives } from "@shared/wc3-def";
import { decodeFileData, encodeFileData, fileSegmentAbilities, fileSegmentLength } from "./codec";

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
    natives.prepare(fileSegmentAbilities);
    return {
        read(path: string): FileRead {
            if (!safePath(path)) return { status: FileReadStatus.InvalidPath };
            const saved: string[] = [];
            try {
                for (const ability of fileSegmentAbilities) saved.push(natives.getTooltip(ability));
            } catch {
                return { status: FileReadStatus.Failed };
            }
            let result: FileRead;
            try {
                // 每段在不同技能。第一段的標記表示沒有檔案；其他段的標記表示資料結束。
                fileSegmentAbilities.forEach((ability, index) =>
                    natives.setTooltip(index === 0 ? "ITF-MISSING" : "ITF-END", ability),
                );
                natives.load(path);
                let raw = "";
                for (const ability of fileSegmentAbilities) {
                    const part = natives.getTooltip(ability);
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
                fileSegmentAbilities.forEach((ability, index) =>
                    natives.setTooltip(saved[index], ability),
                );
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
                // 每段最多 96 個 ASCII 字元，寫入自己技能的第 0 級。連同注入語句仍小於 200 個位元組。
                // Preloader 執行時，串接與第 1 級以上的提示都不生效，所以每段使用不同技能。
                let segment = 0;
                for (let index = 0; index < encoded.length; index += fileSegmentLength) {
                    natives.emit(
                        "\")\ncall BlzSetAbilityTooltip('" +
                            fileSegmentAbilities[segment] +
                            "',\"" +
                            encoded.slice(index, index + fileSegmentLength) +
                            '",0)\n//',
                    );
                    segment++;
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
