const alphabet =
    " !#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";
export const maxFileDataLength = 4096;
/** 每段 96 字元。框架最長 4128 字元，所以最多 43 段。 */
export const fileSegmentLength = 96;
export const fileSegmentCount = 43;

/**
 * 每段使用一個技能的第 0 級：A0IO、AF01～AF42。必須與 scripts/file-io.cjs 相同。
 * 遊戲內確認（2026-11-04）：Preloader 中的串接不生效，第 1 級以上的提示也不能獨立保存。
 */
export const fileSegmentAbilities: readonly string[] = (() => {
    const codes = ["A0IO"];
    for (let index = 1; index < fileSegmentCount; index++)
        codes.push(index < 10 ? `AF0${index}` : `AF${index}`);
    return codes;
})();

/** 限制為可直接放入 JASS 字串的 ASCII。中文等資料須先由呼叫者編碼。 */
function safeData(value: string): boolean {
    if (value.length > maxFileDataLength) return false;
    for (let index = 0; index < value.length; index++)
        if (alphabet.indexOf(value.charAt(index)) < 0) return false;
    return true;
}

/** 最大中間值為 2031246，小於 32 位元整數上限與浮點數精確整數範圍。 */
function checksum(value: string): number {
    let result = 0;
    for (let index = 0; index < value.length; index++)
        result = (result * 31 + value.charCodeAt(index)) % 65521;
    return result;
}

export function encodeFileData(value: string): string | undefined {
    if (!safeData(value)) return undefined;
    return `ITF1|${value.length}|${value}|${checksum(value)}`;
}

export function decodeFileData(value: string): string | undefined {
    if (value.length > maxFileDataLength + 32 || value.slice(0, 5) !== "ITF1|") return undefined;
    const lengthEnd = value.indexOf("|", 5);
    let checkStart = value.length - 1;
    while (checkStart >= 0 && value.charAt(checkStart) !== "|") checkStart--;
    if (lengthEnd < 0 || checkStart <= lengthEnd) return undefined;
    const data = value.slice(lengthEnd + 1, checkStart);
    // 比較標準數字文字，不接受前導零、負值或過長數字。
    if (
        !safeData(data) ||
        value.slice(5, lengthEnd) !== `${data.length}` ||
        value.slice(checkStart + 1) !== `${checksum(data)}`
    )
        return undefined;
    return data;
}
