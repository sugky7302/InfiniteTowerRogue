import { combatAdd, combatNumber } from "./combat-number";

export interface MeleeReachInput {
    distance: number;
    attackRange: number;
    attackerCollision: number;
    targetCollision: number;
    tolerance: number;
}

/** 使用中心距離。剛好等於上限時命中。 */
export function meleeReach(
    input: MeleeReachInput,
    round: (this: void, value: number) => number = (value) => value,
): { limit: number; hit: boolean } {
    for (const value of [
        input.distance,
        input.attackRange,
        input.attackerCollision,
        input.targetCollision,
        input.tolerance,
    ]) {
        if (combatNumber(value) < 0) throw new Error("近戰距離與範圍必須大於或等於 0。");
    }
    let limit = round(combatAdd(input.attackRange, input.attackerCollision));
    limit = round(combatAdd(limit, input.targetCollision));
    limit = round(combatAdd(limit, input.tolerance));
    return { limit: combatNumber(limit), hit: input.distance <= limit };
}
