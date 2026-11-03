import {
    CombatLife,
    PrimaryAttributes,
    DamageTarget,
    DamageAttacker,
    DamageStat,
    DamageResult,
    DamageEvent,
    createCombatLife,
    updateCombatLife,
    reviveCombatLife,
    recoverCombatLife,
    deriveCombatStats,
    settleDamage,
} from "@entities/combat";
import { Clock, Phase, Subscription, Subject } from "@shared/rxwc3";
import { CombatNatives } from "../api/natives";

export interface CombatProfile extends PrimaryAttributes {
    readonly challenge: number;
    readonly armor: number;
    readonly weapon: { readonly base: number; readonly coefficient: number };
}
export interface Combatant {
    readonly unit: unit;
    readonly faction: string;
    readonly profile: CombatProfile;
    readonly stats: ReturnType<typeof deriveCombatStats>;
    life: CombatLife;
    /** 本系統的設定值。登錄時明確寫入 1。 */
    timeScale: number;
    disabledState?: { invulnerable: boolean; targets: number };
}

export class CombatRegistry {
    public readonly owner = new Subscription();
    public readonly units = new Map<unit, Combatant>();
    public readonly registrations = new Subject<Combatant>();
    public constructor(
        public readonly natives: CombatNatives,
        private readonly clock: Clock,
    ) {}

    public register(
        target: unit,
        faction: string,
        role: CombatLife["role"],
        profile: CombatProfile,
    ): Combatant {
        if (this.units.has(target)) throw new Error("戰鬥單位已登錄。");
        const stats = deriveCombatStats(profile, { armor: profile.armor });
        const state: Combatant = {
            unit: target,
            faction,
            profile,
            stats,
            life: createCombatLife(role, stats.maxLife),
            timeScale: 1,
        };
        this.units.set(target, state);
        this.natives.timeScale(target, state.timeScale);
        this.natives.displayLife(target, state.life.maxLife, state.life.life);
        this.registrations.next(state);
        return state;
    }
    public active(target: unit): boolean {
        const state = this.units.get(target);
        return state !== undefined && state.life.life > 0 && this.natives.unitType(target) !== 0;
    }
    public target(target: unit): DamageTarget {
        const state = this.require(target);
        return {
            life: state.life.life,
            maxLife: state.life.maxLife,
            physicalDefense: state.stats.physicalDefense,
            spellDefense: state.stats.spellDefense,
            shields: [{ id: "combat-shield", capacity: state.life.shield }],
        };
    }
    public attacker(target: unit): DamageAttacker {
        const state = this.require(target);
        return {
            modifiers: [
                {
                    id: "combat-critical",
                    stat: DamageStat.CritChance,
                    value: state.stats.critChance,
                },
                {
                    id: "combat-critical-damage",
                    stat: DamageStat.CritDamage,
                    value: state.stats.critDamage - 2,
                },
            ],
        };
    }
    public require(target: unit): Combatant {
        const state = this.units.get(target);
        if (state === undefined) throw new Error("戰鬥單位尚未登錄。");
        return state;
    }
    public setLife(target: unit, life: number, shield: number): void {
        const state = this.require(target);
        // 一般傷害與補血不能解除失能。
        if (!this.active(target)) return;
        state.life = updateCombatLife(state.life, life, shield);
        this.natives.displayLife(target, state.life.maxLife, state.life.life);
        if (state.life.life > 0) return;
        const n = this.natives;
        state.disabledState = {
            invulnerable: n.invulnerable(target),
            targets: n.targetFlags(target),
        };
        n.stop(target);
        n.setInvulnerable(target, true);
        n.setTargetFlags(target, 0);
        if (state.life.incapacitated) {
            n.pauseUnit(target, true);
            n.text(target, "失能");
        } else {
            n.setSpeed(target, 0);
            n.setWeaponEnabled(target, 0, false);
            n.setWeaponEnabled(target, 1, false);
            n.animation(target, "death");
            n.text(target, "擊倒");
            this.owner.add(
                this.clock.schedule(
                    2,
                    () => {
                        n.remove(target);
                        this.units.delete(target);
                    },
                    Phase.Combat,
                ),
            );
        }
    }
    public revive(target: unit): void {
        const state = this.require(target);
        if (!state.life.incapacitated) return;
        const saved = state.disabledState!;
        state.life = reviveCombatLife(state.life);
        this.natives.setTargetFlags(target, saved.targets);
        this.natives.setInvulnerable(target, saved.invulnerable);
        this.natives.pauseUnit(target, false);
        this.natives.displayLife(target, state.life.maxLife, state.life.life);
        state.disabledState = undefined;
    }
    public commit(source: unit, target: unit, result: DamageResult): void {
        this.setLife(
            target,
            result.targetLife,
            result.shields.reduce((sum, item) => sum + item.capacity, 0),
        );
        for (let index = 1; index < result.recipients.length; index++) {
            const recipient = result.recipients[index];
            this.setLife(
                recipient.target as unit,
                recipient.life,
                recipient.shields.reduce((sum, item) => sum + item.capacity, 0),
            );
        }
        const attacker = this.require(source);
        if (this.active(source) && result.leech > 0) {
            const healed = recoverCombatLife(attacker.life, result.leech);
            this.setLife(source, healed.life, healed.shield);
        }
        for (const reaction of result.reactions) this.damage(reaction);
    }
    public damage(event: DamageEvent): DamageResult | undefined {
        const source = event.source as unit,
            target = event.target as unit;
        if (!this.active(target) || !this.units.has(source)) return undefined;
        const result = settleDamage({
            event,
            target: this.target(target),
            attacker: this.attacker(source),
            roll: (_kind, chance) => this.natives.randomInt(1, 10000) <= chance * 10000,
        });
        this.commit(source, target, result);
        return result;
    }
}
