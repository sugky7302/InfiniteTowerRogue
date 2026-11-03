export const spellPower = (intelligence: number, spirit: number): number =>
    intelligence * 2 + spirit;
export const manaCapacity = (intelligence: number, spirit: number): number =>
    10 + spirit * 3 + intelligence * 2;
export const spellDefense = (spirit: number, constitution: number): number =>
    spirit * 2 + constitution;
export interface Defense {
    defense: number;
    resistance: number;
    shield: number;
}
export function resolveDamage(base: number, power: number, coefficient: number, target: Defense) {
    const raw = Math.max(0, base + power * coefficient);
    const effectiveDefense = Math.max(0, target.defense);
    const reduction = Math.min(0.8, effectiveDefense / (effectiveDefense + 100));
    const resisted = raw * (1 - reduction) * (1 - Math.max(-1, Math.min(0.75, target.resistance)));
    const absorbed = Math.min(resisted, Math.max(0, target.shield));
    return {
        raw,
        effectiveDefense,
        reduction,
        absorbed,
        shield: Math.max(0, target.shield - absorbed),
        life: Math.max(0, resisted - absorbed),
    };
}
export function displayNumber(value: number): string {
    const rounded = Math.floor(Math.abs(value) * 10 + 0.5) / 10;
    return rounded === 0 ? "0" : `${value < 0 ? -rounded : rounded}`;
}
