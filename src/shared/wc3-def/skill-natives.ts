import { Defense } from "../../feature/combat/damage";

export interface ResourceNatives<U> {
    cooldown(target: U, ability: number): number;
    startCooldown(target: U, ability: number, seconds: number): void;
    disableAbility(target: U, ability: number, disabled: boolean): void;
    mana(target: U): number;
    setMana(target: U, value: number): void;
    regen(target: U): number;
    setRegen(target: U, value: number): void;
}
export interface SkillNatives extends ResourceNatives<unit> {
    stop(target: unit): void;
    randomInt(low: number, high: number): number;
    x(target: unit): number;
    y(target: unit): number;
    alive(target: unit): boolean;
    enemyVisible(caster: unit, target: unit): boolean;
    defense(target: unit): Defense;
    setShield(target: unit, value: number): void;
    challenge(target: unit): number;
    evasion(target: unit): number;
    combustible(target: unit): boolean;
    damage(source: unit, target: unit, amount: number): void;
    speed(target: unit): number;
    setSpeed(target: unit, value: number): void;
    text(target: unit, message: string): void;
    createEffect(model: string, x: number, y: number): effect;
    moveEffect(target: effect, x: number, y: number): void;
    destroyEffect(target: effect): void;
    area(x: number, y: number, radius: number, visit: (this: void, target: unit) => void): void;
}
