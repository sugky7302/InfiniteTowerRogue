/** 內建 Amls 的 FourCC。全部中間值都在 32 位元整數範圍內。 */
const ABILITY_CODE = "Amls";
export const FILE_ABILITY =
    ABILITY_CODE.charCodeAt(0) * 16777216 +
    ABILITY_CODE.charCodeAt(1) * 65536 +
    ABILITY_CODE.charCodeAt(2) * 256 +
    ABILITY_CODE.charCodeAt(3);
export const FILE_PRELOAD_LIMIT = 259;
export const FILE_PRELOAD_START =
    "\")\n//! beginusercode\nlocal o=''\nPreload=function(s)o=o..s end\nPreloadEnd=function()end\n//!endusercode\n//";
export const FILE_PRELOAD_END = `\")\n//! beginusercode\nBlzSetAbilityIcon(${FILE_ABILITY},o)\n//!endusercode\n//`;
const ESCAPE_CHARACTER = String.fromCharCode(27);

/** 先跳脫 ESC，再跳脫雙引號。切段前必須完成此操作。 */
export function escapeFileData(value: string): string {
    return value
        .split(ESCAPE_CHARACTER)
        .join(ESCAPE_CHARACTER + ESCAPE_CHARACTER)
        .split('"')
        .join(ESCAPE_CHARACTER + "q");
}

/** 從左至右處理跳脫對，避免把 ESC 加 q 的原始文字誤認為雙引號。 */
export function unescapeFileData(value: string): string {
    let result = "";
    for (let index = 0; index < value.length; index++) {
        const current = value.charAt(index);
        const next = value.charAt(index + 1);
        if (current === ESCAPE_CHARACTER && (next === ESCAPE_CHARACTER || next === "q")) {
            result += next === "q" ? '"' : ESCAPE_CHARACTER;
            index++;
        } else result += current;
    }
    return result;
}
