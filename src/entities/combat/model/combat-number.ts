/** 最大的安全 float32 整數。所有算術先檢查，再執行。 */
export const combatNumberLimit = 2147483520;
export function combatNumber(value: number): number {
    if (!Number.isFinite(value) || Math.abs(value) > combatNumberLimit) {
        throw new Error("戰鬥數值超過 32 位元範圍。");
    }
    return value;
}
export function combatAdd(a: number, b: number): number {
    combatNumber(a);
    combatNumber(b);
    if ((b > 0 && a > combatNumberLimit - b) || (b < 0 && a < -combatNumberLimit - b)) {
        throw new Error("戰鬥加法超過 32 位元範圍。");
    }
    return combatNumber(a + b);
}
export function combatMultiply(a: number, b: number): number {
    combatNumber(a);
    combatNumber(b);
    if (Math.abs(b) > 1 && Math.abs(a) > combatNumberLimit / Math.abs(b)) {
        throw new Error("戰鬥乘法超過 32 位元範圍。");
    }
    return combatNumber(a * b);
}
export function clampCombat(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, combatNumber(value)));
}
