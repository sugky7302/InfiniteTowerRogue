import {
    DamageKind,
    DamageOutput,
    DefenseChannel,
    DamageHistory,
    DamageStat,
} from "./damage-event";
import { settleDamage } from "./damage-steps";
import { combatAdd, combatMultiply } from "./combat-number";
export const spellPower = (intelligence: number, spirit: number): number =>
    combatAdd(combatMultiply(intelligence, 2), spirit);
export const manaCapacity = (intelligence: number, spirit: number): number =>
    combatAdd(combatAdd(10, combatMultiply(spirit, 3)), combatMultiply(intelligence, 2));
export const spellDefense = (spirit: number, constitution: number): number =>
    combatAdd(combatMultiply(spirit, 2), constitution);
export interface Defense {
    defense: number;
    resistance: number;
    shield: number;
}
export function resolveDamage(base: number, power: number, coefficient: number, target: Defense) {
    const result = settleDamage({
        event: {
            source: undefined,
            target: undefined,
            kind: DamageKind.Direct,
            output: DamageOutput.Spell,
            canCrit: false,
            parts: [
                {
                    amount: 0,
                    base,
                    power,
                    coefficient,
                    tags: ["spell"],
                    channel: DefenseChannel.Spell,
                    history: DamageHistory.Base,
                },
            ],
        },
        target: {
            life: 100000,
            maxLife: 100000,
            spellDefense: target.defense,
            modifiers: [
                { id: "legacy-resistance", stat: DamageStat.Resistance, value: target.resistance },
            ],
            shields: [{ id: "legacy-shield", capacity: Math.max(0, target.shield) }],
        },
    });
    const raw = result.trace[3].state.parts[0].amount;
    const effectiveDefense = result.effectiveDefenses[0] ?? Math.max(0, target.defense);
    const reduction = Math.min(0.8, effectiveDefense / (effectiveDefense + 100));
    const absorbed = result.recipients[0].shieldConsumed;
    return {
        raw,
        effectiveDefense,
        reduction,
        absorbed,
        shield: result.shields[0].capacity,
        life: result.recipients[0].parts[0]?.amount ?? 0,
    };
}
export function displayNumber(value: number): string {
    const rounded = Math.floor(Math.abs(value) * 10 + 0.5) / 10;
    return rounded === 0 ? "0" : `${value < 0 ? -rounded : rounded}`;
}
