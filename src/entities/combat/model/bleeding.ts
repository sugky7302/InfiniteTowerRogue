import { clampCombat } from "./combat-number";

export interface BleedingWound {
    readonly source: unknown;
    readonly damage: number;
    readonly remainingTicks: number;
}
/** 全來源共用一個流血槽。相同強度只刷新持續時間。 */
export function selectBleedingWound(
    current: BleedingWound | undefined,
    incoming: BleedingWound,
): BleedingWound {
    const next = {
        ...incoming,
        damage: clampCombat(incoming.damage, 0, 2147483520),
        remainingTicks: Math.floor(clampCombat(incoming.remainingTicks, 0, 2147483520)),
    };
    if (current === undefined || next.damage > current.damage) return next;
    if (next.damage < current.damage) return current;
    return { ...current, remainingTicks: next.remainingTicks };
}
