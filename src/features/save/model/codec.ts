import { SaveData, SaveRegistry, maxPackedBytes } from "./format";
import { hmac256, NumberAudit, utf8 } from "../lib/hash";
import { currentKeyVersion, saveKeys } from "../config/keys";

export const saveAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const maxSaveCodeLength = 1100;

/** 只折疊 ASCII 大小寫。其他 UTF-8 位元組保留，確保 Node 與 Lua 一致。 */
export function normalizePlayerName(name: string): string {
    let start = 0;
    let end = name.length;
    const whitespace = (code: number): boolean => code === 32 || (code >= 9 && code <= 13);
    while (start < end && whitespace(name.charCodeAt(start))) start++;
    while (end > start && whitespace(name.charCodeAt(end - 1))) end--;
    const trimmed = name.slice(start, end);
    let result = "";
    for (let index = 0; index < trimmed.length; index++) {
        const char = trimmed.charAt(index);
        const code = trimmed.charCodeAt(index);
        result += code >= 97 && code <= 122 ? char.toUpperCase() : char;
    }
    return result;
}

export function compactCode(code: string): string {
    let result = "";
    for (let index = 0; index < code.length; index++) {
        const byte = code.charCodeAt(index);
        if (byte > 127) return "?";
        const char = code.charAt(index).toUpperCase();
        if (char === "-" || byte === 32 || (byte >= 9 && byte <= 13)) continue;
        result += char === "O" ? "0" : char === "I" || char === "L" ? "1" : char;
    }
    return result;
}

export function encodeBase32(bytes: readonly number[], audit?: NumberAudit): string {
    let pending = 0;
    let bits = 0;
    let text = "";
    for (const byte of bytes) {
        pending = pending * 256 + byte;
        audit?.(pending);
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            text += saveAlphabet.charAt(Math.floor(pending / 2 ** bits));
            pending %= 2 ** bits;
        }
    }
    if (bits > 0) text += saveAlphabet.charAt(pending * 2 ** (5 - bits));
    const groups: string[] = [];
    for (let index = 0; index < text.length; index += 5) groups.push(text.slice(index, index + 5));
    return groups.join("-");
}

export function decodeBase32(code: string, audit?: NumberAudit): number[] | undefined {
    if (code.length > maxSaveCodeLength) return undefined;
    const text = compactCode(code);
    const bytes: number[] = [];
    let pending = 0;
    let bits = 0;
    for (let index = 0; index < text.length; index++) {
        const value = saveAlphabet.indexOf(text.charAt(index));
        if (value < 0) return undefined;
        pending = pending * 32 + value;
        audit?.(pending);
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push(Math.floor(pending / 2 ** bits));
            pending %= 2 ** bits;
        }
    }
    if (pending !== 0 || Math.ceil((bytes.length * 8) / 5) !== text.length) return undefined;
    return bytes;
}

function authentication(
    key: number[],
    bytes: readonly number[],
    name: string,
    keyVersion: number,
    audit?: NumberAudit,
): number[] {
    const player = utf8(normalizePlayerName(name));
    return hmac256(
        key,
        [
            ...utf8("authenticate"),
            keyVersion,
            Math.floor(player.length / 256),
            player.length % 256,
            ...player,
            ...bytes,
        ],
        audit,
    ).slice(0, 16);
}

/** 驗證碼作為每份資料的序列種子。遮罩與排列使用不同的 HMAC 網域。 */
function transform(
    bytes: readonly number[],
    tag: readonly number[],
    key: number[],
    reverse: boolean,
    audit?: NumberAudit,
): number[] {
    const order = bytes.map((_, index) => index);
    let random: number[] = [];
    let cursor = 32;
    let block = 0;
    for (let index = order.length - 1; index > 0; index--) {
        if (cursor >= 32) {
            random = hmac256(
                key,
                [...utf8("order"), ...tag, Math.floor(block / 256), block % 256],
                audit,
            );
            block++;
            cursor = 0;
        }
        const sample = random[cursor] * 256 + random[cursor + 1];
        audit?.(sample);
        const choice = sample % (index + 1);
        cursor += 2;
        const temporary = order[index];
        order[index] = order[choice];
        order[choice] = temporary;
    }
    const output: number[] = [];
    let mask: number[] = [];
    for (let index = 0; index < bytes.length; index++) {
        if (index % 32 === 0)
            mask = hmac256(key, [...utf8("mask"), ...tag, Math.floor(index / 32)], audit);
        if (reverse) output[order[index]] = bytes[index] ^ mask[index % 32];
        else output[index] = bytes[order[index]] ^ mask[index % 32];
    }
    return output;
}

export class SaveCodec {
    private readonly registry: SaveRegistry;
    public constructor(
        registry: SaveRegistry,
        public readonly version: number,
        private readonly audit?: NumberAudit,
    ) {
        this.registry = registry.snapshot();
    }

    public encode(data: SaveData, playerName: string): string | undefined {
        if (utf8(normalizePlayerName(playerName)).length > 256) return undefined;
        const packed = this.registry.pack(data, this.version, this.audit);
        if (packed === undefined) return undefined;
        const key = utf8(saveKeys[currentKeyVersion]);
        const tag = authentication(key, packed, playerName, currentKeyVersion, this.audit);
        return encodeBase32(
            [
                this.version,
                currentKeyVersion,
                ...tag,
                ...transform(packed, tag, key, false, this.audit),
            ],
            this.audit,
        );
    }

    /** 所有驗證失敗只傳回 undefined，不揭露失敗原因。 */
    public decode(code: string, playerName: string): SaveData | undefined {
        if (utf8(normalizePlayerName(playerName)).length > 256) return undefined;
        const bytes = decodeBase32(code, this.audit);
        if (bytes === undefined || bytes.length < 19 || bytes.length > maxPackedBytes + 18)
            return undefined;
        const secret = saveKeys[bytes[1]];
        if (secret === undefined) return undefined;
        const key = utf8(secret);
        const tag = bytes.slice(2, 18);
        const packed = transform(bytes.slice(18), tag, key, true, this.audit);
        const expected = authentication(key, packed, playerName, bytes[1], this.audit);
        let difference = 0;
        for (let index = 0; index < tag.length; index++) difference |= tag[index] ^ expected[index];
        if (difference !== 0 || packed[0] !== bytes[0]) return undefined;
        try {
            return this.registry.unpack(packed, this.version, this.audit);
        } catch {
            return undefined;
        }
    }
}
