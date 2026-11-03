type Word = readonly [number, number];
export type NumberAudit = (this: void, value: number) => void;

const initial = "6a09e667 bb67ae85 3c6ef372 a54ff53a 510e527f 9b05688c 1f83d9ab 5be0cd19";
const constants = (
    "428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 " +
    "d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174 " +
    "e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da " +
    "983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 " +
    "27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85 " +
    "a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 " +
    "19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 " +
    "748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2"
)
    .split(" ")
    .map((word) => parseWord(word));

function parseWord(text: string): Word {
    return [parseInt(text.slice(0, 4), 16), parseInt(text.slice(4), 16)];
}

/** 每次加法最多五個 16 位元肢，最大低肢和為 327675。 */
function add(audit: NumberAudit | undefined, ...words: Word[]): Word {
    let high = 0;
    let low = 0;
    for (const word of words) {
        high += word[0];
        low += word[1];
        audit?.(high);
        audit?.(low);
    }
    high += Math.floor(low / 65536);
    audit?.(high);
    return [high % 65536, low % 65536];
}

function rotate(word: Word, bits: number): Word {
    const input: Word = bits >= 16 ? [word[1], word[0]] : word;
    const shift = bits % 16;
    if (shift === 0) return input;
    const mask = (1 << shift) - 1;
    return [
        (input[0] >>> shift) | ((input[1] & mask) << (16 - shift)),
        (input[1] >>> shift) | ((input[0] & mask) << (16 - shift)),
    ];
}

function shiftRight(word: Word, bits: number): Word {
    return [word[0] >>> bits, (word[1] >>> bits) | ((word[0] & ((1 << bits) - 1)) << (16 - bits))];
}

function xor(a: Word, b: Word, c: Word): Word {
    return [a[0] ^ b[0] ^ c[0], a[1] ^ b[1] ^ c[1]];
}

/** 標準 SHA-256。全部字以高、低 16 位元保存，不建立無號 32 位元值。 */
export function sha256(input: readonly number[], audit?: NumberAudit): number[] {
    if (input.length > 16384) throw new Error("雜湊資料超過上限。");
    const bytes = [...input, 128];
    while (bytes.length % 64 !== 56) bytes.push(0);
    const bits = input.length * 8;
    bytes.push(0, 0, 0, 0, 0, Math.floor(bits / 65536), Math.floor(bits / 256) % 256, bits % 256);
    const state = initial.split(" ").map((word) => parseWord(word));
    for (let offset = 0; offset < bytes.length; offset += 64) {
        const words: Word[] = [];
        for (let index = 0; index < 16; index++) {
            const start = offset + index * 4;
            words.push([
                bytes[start] * 256 + bytes[start + 1],
                bytes[start + 2] * 256 + bytes[start + 3],
            ]);
        }
        for (let index = 16; index < 64; index++) {
            const a = words[index - 15];
            const b = words[index - 2];
            words.push(
                add(
                    audit,
                    words[index - 16],
                    xor(rotate(a, 7), rotate(a, 18), shiftRight(a, 3)),
                    words[index - 7],
                    xor(rotate(b, 17), rotate(b, 19), shiftRight(b, 10)),
                ),
            );
        }
        let [a, b, c, d, e, f, g, h] = state;
        for (let index = 0; index < 64; index++) {
            const choice: Word = [
                (e[0] & f[0]) ^ ((e[0] ^ 65535) & g[0]),
                (e[1] & f[1]) ^ ((e[1] ^ 65535) & g[1]),
            ];
            const majority: Word = [
                (a[0] & b[0]) ^ (a[0] & c[0]) ^ (b[0] & c[0]),
                (a[1] & b[1]) ^ (a[1] & c[1]) ^ (b[1] & c[1]),
            ];
            const first = add(
                audit,
                h,
                xor(rotate(e, 6), rotate(e, 11), rotate(e, 25)),
                choice,
                constants[index],
                words[index],
            );
            const second = add(audit, xor(rotate(a, 2), rotate(a, 13), rotate(a, 22)), majority);
            h = g;
            g = f;
            f = e;
            e = add(audit, d, first);
            d = c;
            c = b;
            b = a;
            a = add(audit, first, second);
        }
        const result = [a, b, c, d, e, f, g, h];
        for (let index = 0; index < 8; index++)
            state[index] = add(audit, state[index], result[index]);
    }
    const output: number[] = [];
    for (const word of state)
        output.push(word[0] >>> 8, word[0] & 255, word[1] >>> 8, word[1] & 255);
    for (const value of [...bytes, ...output]) audit?.(value);
    return output;
}

/** 同時支援 Node UTF-16 字串與 Lua UTF-8 位元組字串。 */
export function utf8(text: string): number[] {
    const result: number[] = [];
    if (typeof string !== "undefined") {
        for (let index = 0; index < text.length; index++) result.push(text.charCodeAt(index));
        return result;
    }
    for (let index = 0; index < text.length; index++) {
        let code = text.charCodeAt(index);
        if (code >= 55296 && code <= 56319 && index + 1 < text.length) {
            const next = text.charCodeAt(index + 1);
            if (next >= 56320 && next <= 57343) {
                code = (code - 55296) * 1024 + next - 56320 + 65536;
                index++;
            }
        }
        if (code < 128) result.push(code);
        else if (code < 2048) result.push(192 + (code >>> 6), 128 + (code & 63));
        else if (code < 65536)
            result.push(224 + (code >>> 12), 128 + ((code >>> 6) & 63), 128 + (code & 63));
        else
            result.push(
                240 + (code >>> 18),
                128 + ((code >>> 12) & 63),
                128 + ((code >>> 6) & 63),
                128 + (code & 63),
            );
    }
    return result;
}
declare const string: unknown;

export function hmac256(
    key: readonly number[],
    input: readonly number[],
    audit?: NumberAudit,
): number[] {
    const material = key.length > 64 ? sha256(key, audit) : key;
    const inner: number[] = [];
    const outer: number[] = [];
    for (let index = 0; index < 64; index++) {
        const byte = index < material.length ? material[index] : 0;
        inner.push(byte ^ 54);
        outer.push(byte ^ 92);
    }
    return sha256([...outer, ...sha256([...inner, ...input], audit)], audit);
}
