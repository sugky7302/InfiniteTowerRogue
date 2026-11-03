import { Observable, Subscription, Frame, Clock, Phase } from "../../shared/rxwc3";
import { createWc3Events } from "../../shared/rxwc3/wc3/events";
import { SpellEvent } from "../../shared/wc3-def/events";
import { SkillNatives } from "../../shared/wc3-def/skill-natives";
import { Burning, MovementSlows } from "../combat/effects";
import { displayNumber, resolveDamage, spellPower } from "../combat/damage";
import { attributeModifier, checkValue, rollCheck } from "./check";
import { areaChallenge, castSeconds, scholar, SkillDefinition, yardsToWc3 } from "./definitions";

interface Projectile {
    event: SpellEvent;
    skill: SkillDefinition;
    x: number;
    y: number;
    visual: effect;
}
interface TargetEffects {
    burns: Map<unit, Burning>;
    slows: MovementSlows;
}

/** 共同啟動流程只建立一個實例，全部投射物共用一個幀訂閱。 */
export class SkillRuntime {
    public readonly owner = new Subscription();
    private readonly projectiles: Projectile[] = [];
    private readonly effects = new Map<unit, TargetEffects>();
    /** 施法者目前正在施放的技能代碼（施法計時中）。供暫停轉接判斷是否跳過停用。 */
    private readonly casting = new Map<unit, number>();
    private impactSource: unit | undefined;
    private impactSkill: SkillDefinition | undefined;
    private readonly visitArea: (this: void, target: unit) => void = (target) => {
        this.hit(this.impactSource!, target, this.impactSkill!);
    };

    public constructor(
        private readonly natives: SkillNatives,
        private readonly clock: Clock,
        frameSource: Observable<Frame>,
    ) {
        this.owner.add(frameSource.subscribe(this.step));
        this.owner.add(() => {
            for (const projectile of this.projectiles) natives.destroyEffect(projectile.visual);
            this.projectiles.length = 0;
            for (const state of this.effects.values()) {
                for (const burn of state.burns.values()) burn.clear();
                state.slows.clear();
            }
            this.effects.clear();
        });
    }

    /** 施法者是否正在施法（施法計時中）。 */
    public isCasting(caster: unit): boolean {
        return this.casting.has(caster);
    }

    public track(
        caster: unit,
        definitions: readonly SkillDefinition[],
        events: Pick<
            ReturnType<typeof createWc3Events>,
            "onSpellChannel" | "onSpellEndCast" | "onUnitOrder"
        >,
        abilityId: (this: void, code: string) => number,
    ): void {
        let active: SpellEvent | undefined;
        let pending: Subscription | undefined;
        const clear = (): void => {
            active = undefined;
            this.casting.delete(caster);
            pending?.unsubscribe();
            pending = undefined;
        };
        const interrupt = (): void => {
            if (active === undefined) return;
            clear();
            this.natives.text(caster, "中斷");
        };
        this.owner.add(clear);
        // 起始命令先於 CHANNEL。只有 CHANNEL 建立的施法會被後續命令取消。
        this.owner.add(events.onUnitOrder.of(caster).subscribe(interrupt));
        this.owner.add(
            events.onSpellEndCast.of(caster).subscribe((event) => {
                if (active?.abilityId === event.abilityId) interrupt();
            }),
        );
        this.owner.add(
            events.onSpellChannel.of(caster).subscribe((event) => {
                interrupt();
                const skill = definitions.find(
                    (value) => abilityId(value.code) === event.abilityId,
                );
                if (skill === undefined) return;
                if (this.clock.isPaused()) {
                    // 暫停期間不得施法。正在施法的單位暫停時不停用技能（停用會中斷引導），
                    // 所以在此拒絕。依規則此次施法沒有開始：返還引擎已扣除的法力，結束剛開始的冷卻。
                    // 停止命令也會中斷暫停前的施法，與「施法中下達其他命令即中斷」一致。
                    const n = this.natives;
                    n.stop(caster);
                    n.setMana(caster, n.mana(caster) + skill.mana);
                    n.startCooldown(caster, event.abilityId, 0);
                    n.text(caster, "暫停中無法施法");
                    return;
                }
                active = event;
                this.casting.set(caster, event.abilityId);
                pending = this.clock.schedule(
                    castSeconds(skill),
                    () => {
                        // 先清除狀態，停止命令同步產生的命令與 ENDCAST 才不會取消完成流程。
                        clear();
                        this.natives.stop(caster);
                        this.completeCast(event, skill);
                    },
                    Phase.Combat,
                );
            }),
        );
    }

    private completeCast(event: SpellEvent, skill: SkillDefinition): void {
        const n = this.natives;
        if (!n.alive(event.caster)) return;
        if (
            skill.target === "unit" &&
            (event.target === undefined ||
                !n.alive(event.target) ||
                !n.enemyVisible(event.caster, event.target))
        )
            return;
        const threshold = checkValue({
            challenge: skill.target === "point" ? areaChallenge : n.challenge(event.target!),
            complexity: skill.complexity,
            adverse: skill.target === "point" ? 0 : n.evasion(event.target!),
            level: scholar.level,
            attribute: attributeModifier(scholar.intelligence),
            knowledge: skill.knowledge,
            favorable: 0,
        });
        const result = rollCheck(threshold, (low, high) => n.randomInt(low, high));
        n.text(
            event.caster,
            `${skill.name}：${result.success ? "成功" : "失敗"}，骰值 ${result.roll}，檢定值 ${threshold}`,
        );
        if (!result.success) return;
        const x = n.x(event.caster),
            y = n.y(event.caster);
        this.projectiles.push({ event, skill, x, y, visual: n.createEffect(skill.model, x, y) });
    }

    private readonly step: (this: void, frame: Frame) => void = (frame) => {
        const n = this.natives;
        for (let index = this.projectiles.length - 1; index >= 0; index--) {
            const p = this.projectiles[index];
            if (p.skill.target === "unit" && !n.alive(p.event.target!)) {
                n.destroyEffect(p.visual);
                this.projectiles.splice(index, 1);
                continue;
            }
            const x = p.skill.target === "unit" ? n.x(p.event.target!) : p.event.targetX;
            const y = p.skill.target === "unit" ? n.y(p.event.target!) : p.event.targetY;
            const dx = x - p.x,
                dy = y - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const travel = yardsToWc3(p.skill.speedYards) * frame.deltaSeconds;
            if (distance <= travel) {
                n.moveEffect(p.visual, x, y);
                n.destroyEffect(p.visual);
                this.projectiles.splice(index, 1);
                if (p.skill.target === "unit") this.hit(p.event.caster, p.event.target!, p.skill);
                else {
                    this.impactSource = p.event.caster;
                    this.impactSkill = p.skill;
                    n.area(x, y, yardsToWc3(p.skill.radiusYards), this.visitArea);
                    this.impactSource = undefined;
                    this.impactSkill = undefined;
                }
            } else {
                p.x += (dx / distance) * travel;
                p.y += (dy / distance) * travel;
                n.moveEffect(p.visual, p.x, p.y);
            }
        }
    };

    private deal(source: unit, target: unit, base: number, coefficient: number): void {
        const n = this.natives;
        const result = resolveDamage(
            base,
            spellPower(scholar.intelligence, scholar.spirit),
            coefficient,
            n.defense(target),
        );
        n.setShield(target, result.shield);
        n.damage(source, target, result.life);
        n.text(target, `傷害 ${displayNumber(result.life)}`);
    }

    private hit(source: unit, target: unit, skill: SkillDefinition): void {
        const n = this.natives;
        if (!n.alive(target)) return;
        this.deal(source, target, skill.baseDamage, skill.coefficient);
        if (!n.alive(target)) return;
        let state = this.effects.get(target);
        if (state === undefined) {
            const baseSpeed = n.speed(target);
            state = {
                burns: new Map(),
                slows: new MovementSlows(this.clock, (multiplier) => {
                    if (n.alive(target)) n.setSpeed(target, baseSpeed * multiplier);
                }),
            };
            this.effects.set(target, state);
        }
        if (skill.burn !== undefined && n.combustible(target)) {
            const burnData = skill.burn;
            let burn = state.burns.get(source);
            if (burn === undefined) {
                burn = new Burning(this.clock, () => {
                    if (!n.alive(target) || !n.combustible(target)) {
                        burn!.clear();
                        return;
                    }
                    n.text(target, "燃燒");
                    this.deal(source, target, burnData.damage, 0);
                });
                state.burns.set(source, burn);
            }
            burn.refresh(burnData.delay, burnData.period, burnData.duration);
            n.text(target, `燃燒：${burnData.duration} 秒`);
        }
        if (skill.slow !== undefined) {
            const slow = skill.slow;
            state.slows.refresh(source, slow.group, slow.multiplier, slow.duration);
            n.text(target, `減速：${displayNumber(slow.multiplier * 100)}%，${slow.duration} 秒`);
        }
    }
}
