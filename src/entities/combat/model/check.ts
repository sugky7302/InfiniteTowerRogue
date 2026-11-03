export const attributeModifier = (value: number): number =>
    Math.min(10, Math.floor(Math.sqrt(Math.max(0, value))));
export interface CheckInput {
    challenge: number;
    complexity: number;
    adverse: number;
    level: number;
    attribute: number;
    knowledge: number;
    favorable: number;
}
export function checkValue(input: CheckInput): number {
    return Math.max(
        2,
        Math.min(
            19,
            9 +
                input.challenge +
                input.complexity +
                input.adverse -
                input.level -
                input.attribute -
                input.knowledge -
                input.favorable,
        ),
    );
}
export function rollCheck(
    threshold: number,
    randomInt: (this: void, low: number, high: number) => number,
) {
    const roll = randomInt(1, 20);
    return { roll, threshold, success: roll > threshold };
}
