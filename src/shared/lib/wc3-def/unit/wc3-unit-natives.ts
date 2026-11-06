import { protectedCall } from "../../rxwc3/core/protected-call";
import { UnitAreaNatives, UnitDamageNatives, UnitNatives } from "./unit-natives";

/** 載入模組不呼叫原生函式。 */
export const wc3UnitNatives: UnitNatives = {
    stop: (target) => {
        IssueImmediateOrder(target, "stop");
    },
    x: (target) => GetUnitX(target),
    y: (target) => GetUnitY(target),
    alive: (target) =>
        GetUnitTypeId(target) !== 0 &&
        GetWidgetLife(target) > 0.405 &&
        !IsUnitType(target, UNIT_TYPE_DEAD),
    enemyVisible: (observer, target) =>
        IsUnitEnemy(target, GetOwningPlayer(observer)!) &&
        IsUnitVisible(target, GetOwningPlayer(observer)!),
    speed: (target) => GetUnitMoveSpeed(target),
    setSpeed: (target, value) => SetUnitMoveSpeed(target, value),
    mana: (target) => GetUnitState(target, UNIT_STATE_MANA),
    setMana: (target, value) => SetUnitState(target, UNIT_STATE_MANA, value),
    regen: (target) => BlzGetUnitRealField(target, UNIT_RF_MANA_REGENERATION),
    setRegen(target, value) {
        BlzSetUnitRealField(target, UNIT_RF_MANA_REGENERATION, value);
    },
    unitType: (target) => GetUnitTypeId(target),
    isHero: (target) => IsUnitType(target, UNIT_TYPE_HERO),
    unitName: (target, text) => BlzSetUnitName(target, text),
    heroName: (target, text) => BlzSetHeroProperName(target, text),
    watchUnits(callback) {
        // 全部用戶端使用相同順序建立 handle。回呼只登記與設定文字。
        const bounds = GetWorldBounds()!;
        const area = CreateRegion();
        RegionAddRect(area, bounds);
        const entered = CreateTrigger();
        TriggerRegisterEnterRegion(entered, area, undefined);
        TriggerAddAction(entered, () => callback(GetEnteringUnit()!));
        const group = CreateGroup()!;
        GroupEnumUnitsInRect(group, bounds, undefined);
        let target = FirstOfGroup(group);
        while (target !== undefined) {
            GroupRemoveUnit(group, target);
            callback(target);
            target = FirstOfGroup(group);
        }
        DestroyGroup(group);
        return () => {
            DestroyTrigger(entered);
            RemoveRegion(area);
            RemoveRect(bounds);
        };
    },
};

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

/** 在共同流程呼叫一次。建立傷害後事件的觸發器。 */
export function createWc3UnitDamage(): { natives: UnitDamageNatives; destroy(): void } {
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
    return {
        natives: {
            // 先用通用傷害送入原生事件，再以傷害後事件固定最終值。
            damage(source, target, amount) {
                pending.push({ source, target, amount, applied: false });
                const [ok, result] = protectedCall(sendDamage, source, target, amount);
                pending.pop();
                if (!ok) throw result;
            },
        },
        destroy(): void {
            DestroyTrigger(damageTrigger);
        },
    };
}

/** 在共同流程呼叫一次。建立共用的列舉群組。 */
export function createWc3UnitArea(): { natives: UnitAreaNatives; destroy(): void } {
    const group = CreateGroup()!;
    return {
        natives: {
            area(x, y, radius, visit) {
                GroupEnumUnitsInRange(group, x, y, radius, undefined);
                let target = FirstOfGroup(group);
                while (target !== undefined) {
                    GroupRemoveUnit(group, target);
                    visit(target);
                    target = FirstOfGroup(group);
                }
            },
        },
        destroy(): void {
            DestroyGroup(group);
        },
    };
}
