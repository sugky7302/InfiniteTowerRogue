import { combatAdd, combatNumber } from "./combat-number";

export const attributeModifier = (value: number): number =>
    Math.min(10, Math.floor(Math.sqrt(Math.max(0, combatNumber(value)))));
export interface CheckInput {
    challenge: number;
    complexity: number;
    adverse: number;
    level: number;
    attribute: number;
    knowledge: number;
    favorable: number;
}
export type GeneralCheckInput = Omit<CheckInput, "complexity" | "knowledge">;
export const clampCheck = (value: number): number => Math.max(2, Math.min(19, combatNumber(value)));
function sumCheck(...values: number[]): number {
    let result = 0;
    for (const value of values) result = combatAdd(result, value);
    return clampCheck(result);
}
export function generalCheckValue(input: GeneralCheckInput): number {
    return sumCheck(
        11,
        input.challenge,
        input.adverse,
        -input.level,
        -input.attribute,
        -input.favorable,
    );
}
export function checkValue(input: CheckInput): number {
    return sumCheck(
        9,
        input.challenge,
        input.complexity,
        input.adverse,
        -input.level,
        -input.attribute,
        -input.knowledge,
        -input.favorable,
    );
}
export function rollCheck(
    threshold: number,
    randomInt: (this: void, low: number, high: number) => number,
) {
    const roll = randomInt(1, 20);
    return { roll, threshold, success: roll > threshold };
}
