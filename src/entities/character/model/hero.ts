import { getClassDefinition } from "../config/classes";

export interface PrimaryAttributeSet {
    readonly strength: number;
    readonly precision: number;
    readonly agility: number;
    readonly constitution: number;
    readonly spirit: number;
    readonly intelligence: number;
    readonly luck: number;
    readonly affinity: number;
}
export interface ClassLevel {
    readonly classId: string;
    readonly level: number;
}
export interface HeroState {
    readonly attributes: PrimaryAttributeSet;
    readonly classes: readonly ClassLevel[];
    readonly knowledge: readonly string[];
}
export const LevelUpFailure = {
    Uncertified: "uncertified",
    MaximumLevel: "maximum-level",
    UnknownClass: "unknown-class",
} as const;
export type LevelUpFailure = (typeof LevelUpFailure)[keyof typeof LevelUpFailure];
export type LevelUpResult =
    | { readonly ok: true; readonly hero: HeroState }
    | { readonly ok: false; readonly reason: LevelUpFailure };

function integer(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value > 2147483520) {
        throw new Error("英雄數值必須是 32 位元非負整數。");
    }
    return value;
}
export function combatLevel(hero: HeroState): number {
    let result = 0;
    for (const entry of hero.classes) {
        const level = integer(entry.level);
        if (level > 2147483520 - result) throw new Error("戰鬥等級超過 32 位元範圍。");
        result += level;
    }
    return result;
}
/** 升級只改變所選職業與固定成長。知識清單由呼叫者管理。 */
export function levelUp(hero: HeroState, classId: string): LevelUpResult {
    const selected = hero.classes.findIndex((entry) => entry.classId === classId);
    if (selected < 0) return { ok: false, reason: LevelUpFailure.Uncertified };
    const definition = getClassDefinition(classId);
    if (!definition) return { ok: false, reason: LevelUpFailure.UnknownClass };
    const current = integer(hero.classes[selected].level);
    if (current >= definition.tier * 5) return { ok: false, reason: LevelUpFailure.MaximumLevel };
    const attributes = { ...hero.attributes };
    for (const key of Object.keys(attributes) as (keyof PrimaryAttributeSet)[]) {
        const value = integer(attributes[key]);
        const growth = integer(definition.growth[key] ?? 0);
        if (growth > 2147483520 - value) throw new Error("英雄成長超過 32 位元範圍。");
        attributes[key] = value + growth;
    }
    const next: HeroState = {
        attributes,
        classes: hero.classes.map((entry, index) =>
            index === selected ? { ...entry, level: current + 1 } : { ...entry },
        ),
        knowledge: [...hero.knowledge],
    };
    combatLevel(next);
    return { ok: true, hero: next };
}
