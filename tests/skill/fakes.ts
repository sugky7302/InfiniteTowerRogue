import { TimerNatives } from "@shared/lib/wc3-def";
import { SkillNatives } from "@features/skill";
import { testEnemy } from "@entities/character";
import { CombatStats, Defense, attributeModifier } from "@entities/combat";

export class FakeFrames implements TimerNatives {
    public starts = 0;
    public stops = 0;
    public seconds = 0;
    private callback: ((this: void) => void) | undefined;
    public start(seconds: number, callback: (this: void) => void): (this: void) => void {
        this.starts++;
        this.seconds = seconds;
        this.callback = callback;
        return () => {
            this.stops++;
            this.callback = undefined;
        };
    }
    public fire(count = 1): void {
        for (let index = 0; index < count; index++) this.callback?.();
    }
}

export interface FakeUnit {
    x: number;
    y: number;
    alive: boolean;
    visible: boolean;
    enemy: boolean;
    combustible: boolean;
    defense: number;
    resistance: number;
    shield: number;
    speed: number;
    mana: number;
    regen: number;
    cooldowns: Map<number, number>;
    disabled: Map<number, number>;
}
export const unitState = (target: unit): FakeUnit => target as unknown as FakeUnit;
export function makeUnit(x = 0, y = 0): unit {
    return {
        x,
        y,
        alive: true,
        visible: true,
        enemy: true,
        combustible: true,
        defense: 12,
        resistance: 0,
        shield: 0,
        speed: 270,
        mana: 69,
        regen: 2,
        cooldowns: new Map(),
        disabled: new Map(),
    } as unknown as unit;
}
export const abilityCode = (code: string): number => (code === "A0SF" ? 1 : 2);
export class FakeSkillNatives implements SkillNatives, CombatStats {
    public caster(): { level: number; intelligence: number; spellPower: number } {
        return { level: 1, intelligence: 16, spellPower: 41 };
    }
    public stops: unit[] = [];
    public onStop: ((this: void, target: unit) => void) | undefined;
    public resourceCalls: string[] = [];
    public stop(target: unit): void {
        this.stops.push(target);
        this.onStop?.(target);
    }
    public disableAbility(target: unit, ability: number, disabled: boolean): void {
        const counts = unitState(target).disabled;
        counts.set(ability, (counts.get(ability) ?? 0) + (disabled ? 1 : -1));
        this.resourceCalls.push(disabled ? "停用" : "啟用");
    }
    public roll = 20;
    public randomCalls = 0;
    public readonly randomInt = (low: number, high: number): number => {
        if (low !== 1 || high !== 20) throw new Error("骰值範圍錯誤。");
        this.randomCalls++;
        return this.roll;
    };
    public targets: unit[] = [];
    public hits: { source: unit; target: unit; amount: number }[] = [];
    public messages: string[] = [];
    public visuals: { x: number; y: number; destroyed: boolean }[] = [];
    public x(target: unit): number {
        return unitState(target).x;
    }
    public y(target: unit): number {
        return unitState(target).y;
    }
    public alive(target: unit): boolean {
        return unitState(target).alive;
    }
    public enemyVisible(_caster: unit, target: unit): boolean {
        return unitState(target).visible && unitState(target).enemy;
    }
    public defense(target: unit): Defense {
        return unitState(target);
    }
    public setShield(target: unit, value: number): void {
        unitState(target).shield = value;
    }
    public challenge(): number {
        return testEnemy.challenge;
    }
    public evasion(): number {
        return attributeModifier(testEnemy.agility);
    }
    public combustible(target: unit): boolean {
        return unitState(target).combustible;
    }
    public damage(source: unit, target: unit, amount: number): void {
        this.hits.push({ source, target, amount });
    }
    public speed(target: unit): number {
        return unitState(target).speed;
    }
    public setSpeed(target: unit, value: number): void {
        unitState(target).speed = value;
    }
    public text(_target: unit, message: string): void {
        this.messages.push(message);
    }
    public createEffect(_model: string, x: number, y: number): effect {
        const visual = { x, y, destroyed: false };
        this.visuals.push(visual);
        return visual as unknown as effect;
    }
    public moveEffect(target: effect, x: number, y: number): void {
        const visual = target as unknown as { x: number; y: number };
        visual.x = x;
        visual.y = y;
    }
    public destroyEffect(target: effect): void {
        (target as unknown as { destroyed: boolean }).destroyed = true;
    }
    public area(
        x: number,
        y: number,
        radius: number,
        visit: (this: void, target: unit) => void,
    ): void {
        for (const target of this.targets) {
            const dx = this.x(target) - x,
                dy = this.y(target) - y;
            if (dx * dx + dy * dy <= radius * radius) visit(target);
        }
    }
    public cooldown(target: unit, ability: number): number {
        return unitState(target).cooldowns.get(ability) ?? 0;
    }
    public startCooldown(target: unit, ability: number, seconds: number): void {
        this.resourceCalls.push(seconds > 0 ? "開始冷卻" : "結束冷卻");
        unitState(target).cooldowns.set(ability, seconds);
    }
    public mana(target: unit): number {
        return unitState(target).mana;
    }
    public setMana(target: unit, value: number): void {
        unitState(target).mana = value;
    }
    public regen(target: unit): number {
        return unitState(target).regen;
    }
    public setRegen(target: unit, value: number): void {
        unitState(target).regen = value;
    }
}
