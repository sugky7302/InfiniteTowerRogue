export interface SkillDefinition {
    readonly code: string;
    readonly name: string;
    readonly target: "point" | "unit";
    readonly complexity: number;
    readonly rangeTier: number;
    readonly baseRangeYards: number;
    readonly speedYards: number;
    readonly radiusYards: number;
    readonly baseDamage: number;
    readonly coefficient: number;
    readonly knowledge: number;
    readonly mana: number;
    readonly cooldown: number;
    readonly model: string;
    readonly burn?: {
        readonly damage: number;
        readonly delay: number;
        readonly period: number;
        readonly duration: number;
    };
    readonly slow?: {
        readonly multiplier: number;
        readonly duration: number;
        readonly group: string;
    };
}

// 來源：docs/skill-system/PLAN.md。速度、半徑、知識、法力與冷卻中的試玩值依該稿。
export const fireball: SkillDefinition = {
    code: "A0SF",
    name: "火球術",
    target: "point",
    complexity: 4,
    rangeTier: 0,
    baseRangeYards: 10,
    speedYards: 20,
    radiusYards: 3,
    baseDamage: 10,
    coefficient: 0,
    knowledge: 4,
    mana: 15,
    cooldown: 4,
    model: "Abilities\\Weapons\\FireBallMissile\\FireBallMissile.mdl",
    burn: { damage: 2, delay: 1, period: 1, duration: 3 },
};
export const frostbolt: SkillDefinition = {
    code: "A0SI",
    name: "寒冰箭",
    target: "unit",
    complexity: 3,
    rangeTier: 2,
    baseRangeYards: 10,
    speedYards: 20,
    radiusYards: 0,
    baseDamage: 10,
    coefficient: 0.8,
    knowledge: 3,
    mana: 10,
    cooldown: 0,
    model: "Abilities\\Weapons\\LichMissile\\LichMissile.mdl",
    slow: { multiplier: 0.5, duration: 8, group: "寒冰箭減速" },
};
export const skills = [fireball, frostbolt];

export const areaChallenge = 1;
export const yardsToWc3 = (yards: number): number => yards * 32;
export const castSeconds = (skill: SkillDefinition, speed = 0, extra = 0): number =>
    Math.max(0.1, (0.5 + skill.complexity * 0.25 + skill.rangeTier * 0.25 + extra) / (1 + speed));
export const rangeYards = (skill: SkillDefinition): number =>
    skill.baseRangeYards * 2 ** skill.rangeTier;
