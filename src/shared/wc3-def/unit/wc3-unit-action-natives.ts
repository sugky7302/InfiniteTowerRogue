import { UnitActionNatives } from "./unit-action-natives";

export const wc3UnitActionNatives: UnitActionNatives = {
    timeScale: (target, value) => SetUnitTimeScale(target, value),
    weaponEnabled: (target, index) =>
        BlzGetUnitWeaponBooleanField(target, UNIT_WEAPON_BF_ATTACKS_ENABLED, index),
    setWeaponEnabled(target, index, value) {
        if (BlzGetUnitWeaponBooleanField(target, UNIT_WEAPON_BF_ATTACKS_ENABLED, index) === value)
            return;
        if (!BlzSetUnitWeaponBooleanField(target, UNIT_WEAPON_BF_ATTACKS_ENABLED, index, value))
            throw new Error("單位武器啟用欄位寫入失敗。");
    },
    attackRange: (target) => BlzGetUnitWeaponRealField(target, UNIT_WEAPON_RF_ATTACK_RANGE, 0),
    collision: (target) => BlzGetUnitCollisionSize(target),
    displayLife(target, maximum, current) {
        BlzSetUnitMaxHP(target, Math.max(1, Math.ceil(maximum)));
        // 失能與死亡動作期間保留原生單位。內部生命仍為 0。
        SetWidgetLife(target, Math.max(1, current));
    },
    pauseUnit: (target, paused) => PauseUnit(target, paused),
    invulnerable: (target) => BlzIsUnitInvulnerable(target),
    setInvulnerable: (target, value) => SetUnitInvulnerable(target, value),
    targetFlags: (target) => BlzGetUnitIntegerField(target, UNIT_IF_TARGETED_AS),
    setTargetFlags(target, value) {
        if (!BlzSetUnitIntegerField(target, UNIT_IF_TARGETED_AS, value))
            throw new Error("單位目標分類欄位寫入失敗。");
    },
    animation: (target, name) => SetUnitAnimation(target, name),
    remove: (target) => RemoveUnit(target),
    move(target, x, y) {
        IssuePointOrder(target, "move", x, y);
    },
    face: (target, radians) => SetUnitFacing(target, (radians * 180) / Math.PI),
    issue(target, order) {
        if (order.kind === "target" && order.target !== undefined)
            IssueTargetOrderById(target, order.orderId, order.target);
        else if (order.kind === "point")
            IssuePointOrderById(target, order.orderId, order.targetX, order.targetY);
        else IssueImmediateOrderById(target, order.orderId);
    },
};
