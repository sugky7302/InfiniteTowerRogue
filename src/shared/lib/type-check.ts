export function safeInteger(n: unknown): number {
    if (!Number.isInteger(n)) throw new Error("必須是整數");

    const n1 = Number(n);
    if (n1 < 0) throw new Error(`${n1} < 0`);
    if (n1 > 2147483647) throw new Error(`${n1} > 2147483647`);

    return Math.floor(n1);
}
