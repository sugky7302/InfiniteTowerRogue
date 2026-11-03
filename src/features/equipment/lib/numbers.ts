import { combatNumber, combatAdd, combatMultiply } from "@entities/combat";

export type EquipmentRound = (this: void, value: number) => number;
/** 取整前後都檢查，避免 float32 取整跨過安全上限。 */
export function equipmentNumber(value: number, round: EquipmentRound): number {
    return combatNumber(round(combatNumber(value)));
}
export function equipmentAdd(a: number, b: number, round: EquipmentRound): number {
    a = equipmentNumber(a, round);
    b = equipmentNumber(b, round);
    return equipmentNumber(combatAdd(a, b), round);
}
export function equipmentMultiply(a: number, b: number, round: EquipmentRound): number {
    a = equipmentNumber(a, round);
    b = equipmentNumber(b, round);
    return equipmentNumber(combatMultiply(a, b), round);
}
