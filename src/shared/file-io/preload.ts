/** 內建 Amls 的 FourCC。全部中間值都在 32 位元整數範圍內。 */
const abilityCode = "Amls";
export const fileAbility =
    abilityCode.charCodeAt(0) * 16777216 +
    abilityCode.charCodeAt(1) * 65536 +
    abilityCode.charCodeAt(2) * 256 +
    abilityCode.charCodeAt(3);
export const filePreloadLimit = 259;
export const filePreloadStart =
    "\")\n//! beginusercode\nlocal o=''\nPreload=function(s)o=o..s end\nPreloadEnd=function()end\n//!endusercode\n//";
export const filePreloadEnd = `\")\n//! beginusercode\nBlzSetAbilityIcon(${fileAbility},o)\n//!endusercode\n//`;
const escapeCharacter = String.fromCharCode(27);

/** 先跳脫 ESC，再跳脫雙引號。切段前必須完成此操作。 */
export function escapeFileData(value: string): string {
    return value
        .split(escapeCharacter)
        .join(escapeCharacter + escapeCharacter)
        .split('"')
        .join(escapeCharacter + "q");
}

/** 從左至右處理跳脫對，避免把 ESC 加 q 的原始文字誤認為雙引號。 */
export function unescapeFileData(value: string): string {
    let result = "";
    for (let index = 0; index < value.length; index++) {
        const current = value.charAt(index);
        const next = value.charAt(index + 1);
        if (current === escapeCharacter && (next === escapeCharacter || next === "q")) {
            result += next === "q" ? '"' : escapeCharacter;
            index++;
        } else result += current;
    }
    return result;
}
