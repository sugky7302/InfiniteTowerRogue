import type { PrimaryAttributeSet } from "../model/hero";

export const ClassId = { RuneApprentice: "rune-apprentice" } as const;
export type ClassId = (typeof ClassId)[keyof typeof ClassId];
export interface ClassDefinition {
    readonly id: ClassId;
    readonly name: string;
    readonly tier: number;
    readonly growth: Readonly<Partial<PrimaryAttributeSet>>;
}
export const classDefinitions: readonly ClassDefinition[] = [
    { id: ClassId.RuneApprentice, name: "符文學徒", tier: 1, growth: { intelligence: 1 } },
];
export function getClassDefinition(id: string): ClassDefinition | undefined {
    return classDefinitions.find((entry) => entry.id === id);
}
