export type EquipmentRound = (this: void, value: number) => number;
const limit = 2147483520;
/** H4 待改用 combat 公開入口的相同運算函式。 */
export function equipmentNumber(value: number, round: EquipmentRound): number {
    if (!Number.isFinite(value) || Math.abs(value) > limit)
        throw new Error("裝備數值超過 32 位元範圍。");
    const result = round(value);
    if (!Number.isFinite(result) || Math.abs(result) > limit)
        throw new Error("裝備取整結果超過 32 位元範圍。");
    return result;
}
export function equipmentAdd(a: number, b: number, round: EquipmentRound): number {
    a = equipmentNumber(a, round);
    b = equipmentNumber(b, round);
    if ((b > 0 && a > limit - b) || (b < 0 && a < -limit - b))
        throw new Error("裝備加法超過 32 位元範圍。");
    return equipmentNumber(a + b, round);
}
export function equipmentMultiply(a: number, b: number, round: EquipmentRound): number {
    a = equipmentNumber(a, round);
    b = equipmentNumber(b, round);
    if (Math.abs(b) > 1 && Math.abs(a) > limit / Math.abs(b))
        throw new Error("裝備乘法超過 32 位元範圍。");
    return equipmentNumber(a * b, round);
}
