import { attributeModifier } from "../../feature/skill/check";
import { scholar, testEnemy } from "../../feature/skill/definitions";
import { Defense, spellDefense } from "../../feature/combat/damage";
import { SkillNatives } from "./skill-natives";
import { protectedCall } from "../rxwc3/core/protected-call";

function sendDamage(this: void, source: unit, target: unit, amount: number): boolean {
    return UnitDamageTarget(
        source,
        target,
        amount,
        false,
        false,
        ATTACK_TYPE_NORMAL,
        DAMAGE_TYPE_UNIVERSAL,
        WEAPON_TYPE_WHOKNOWS,
    );
}

/** 在共同流程建立一次列舉群組。模組載入不建立 handle。 */
export function createWc3SkillNatives() {
    const group = CreateGroup()!;
    const damageTrigger = CreateTrigger();
    const pending: { source: unit; target: unit; amount: number; applied: boolean }[] = [];
    TriggerRegisterAnyUnitEventBJ(damageTrigger, EVENT_PLAYER_UNIT_DAMAGED);
    TriggerAddAction(damageTrigger, () => {
        const current = pending[pending.length - 1];
        if (
            current !== undefined &&
            !current.applied &&
            GetEventDamageSource() === current.source &&
            GetTriggerUnit() === current.target
        ) {
            current.applied = true;
            // 傷害後事件位於原生護甲計算之後、扣血之前。只修正本介面送出的事件。
            BlzSetEventDamage(current.amount);
        }
    });
    const shields = new Map<unit, number>();
    const heroes = new Set<unit>();
    const enemies = new Set<unit>();
    const natives: SkillNatives = {
        stop: (target) => {
            IssueImmediateOrder(target, "stop");
        },
        disableAbility: (target, ability, disabled) =>
            BlzUnitDisableAbility(target, ability, disabled, false),
        randomInt: (low, high) => GetRandomInt(low, high),
        x: (target) => GetUnitX(target),
        y: (target) => GetUnitY(target),
        alive: (target) =>
            GetUnitTypeId(target) !== 0 &&
            GetWidgetLife(target) > 0.405 &&
            !IsUnitType(target, UNIT_TYPE_DEAD),
        enemyVisible: (caster, target) =>
            IsUnitEnemy(target, GetOwningPlayer(caster)!) &&
            IsUnitVisible(target, GetOwningPlayer(caster)!),
        defense(target): Defense {
            return {
                defense: heroes.has(target)
                    ? spellDefense(scholar.spirit, scholar.constitution)
                    : enemies.has(target)
                      ? spellDefense(testEnemy.spirit, testEnemy.constitution)
                      : 0,
                resistance: testEnemy.resistance,
                shield: shields.get(target) ?? 0,
            };
        },
        setShield: (target, value) => {
            shields.set(target, value);
        },
        challenge: () => testEnemy.challenge,
        evasion: (target) => (enemies.has(target) ? attributeModifier(testEnemy.agility) : 0),
        combustible: (target) =>
            heroes.has(target) || (enemies.has(target) && testEnemy.combustible),
        // 先用法術攻擊與通用傷害送入原生事件，再以傷害後事件固定最終值。
        damage(source, target, amount) {
            pending.push({ source, target, amount, applied: false });
            const [ok, result] = protectedCall(sendDamage, source, target, amount);
            pending.pop();
            if (!ok) throw result;
        },
        speed: (target) => GetUnitMoveSpeed(target),
        setSpeed: (target, value) => SetUnitMoveSpeed(target, value),
        cooldown: (target, ability) => BlzGetUnitAbilityCooldownRemaining(target, ability),
        startCooldown(target, ability, seconds) {
            if (seconds > 0) BlzStartUnitAbilityCooldown(target, ability, seconds);
            else BlzEndUnitAbilityCooldown(target, ability);
        },
        mana: (target) => GetUnitState(target, UNIT_STATE_MANA),
        setMana: (target, value) => SetUnitState(target, UNIT_STATE_MANA, value),
        regen: (target) => BlzGetUnitRealField(target, UNIT_RF_MANA_REGENERATION),
        setRegen(target, value) {
            BlzSetUnitRealField(target, UNIT_RF_MANA_REGENERATION, value);
        },
        text(target, message) {
            const tag = CreateTextTag()!;
            SetTextTagText(tag, message, 0.02);
            SetTextTagPosUnit(tag, target, 60);
            SetTextTagVelocity(tag, 0, 0.025);
            SetTextTagPermanent(tag, false);
            SetTextTagLifespan(tag, 3);
            SetTextTagFadepoint(tag, 2);
        },
        createEffect(model, x, y) {
            const visual = AddSpecialEffect(model, x, y)!;
            BlzSetSpecialEffectHeight(visual, 80);
            return visual;
        },
        moveEffect(target, x, y) {
            BlzSetSpecialEffectX(target, x);
            BlzSetSpecialEffectY(target, y);
            BlzSetSpecialEffectHeight(target, 80);
        },
        destroyEffect: (target) => DestroyEffect(target),
        area(x, y, radius, visit) {
            GroupEnumUnitsInRange(group, x, y, radius, undefined);
            let target = FirstOfGroup(group);
            while (target !== undefined) {
                GroupRemoveUnit(group, target);
                visit(target);
                target = FirstOfGroup(group);
            }
        },
    };
    return {
        natives,
        heroes,
        enemies,
        destroy(): void {
            DestroyTrigger(damageTrigger);
            DestroyGroup(group);
            shields.clear();
            heroes.clear();
            enemies.clear();
        },
    };
}
