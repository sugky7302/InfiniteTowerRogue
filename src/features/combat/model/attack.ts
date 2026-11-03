import {
    attributeModifier,
    generalCheckValue,
    rollCheck,
    meleeReach,
    MeleeReachInput,
    DamageKind,
    DamageOutput,
    DefenseChannel,
    DamageHistory,
    displayNumber,
} from "@entities/combat";
import { CombatRegistry } from "./registry";

/** D20 先於碰撞。預告攻擊在作用時使用相同檢定。 */
export function attackCheck(registry: CombatRegistry, source: unit, target: unit): boolean {
    const attacker = registry.require(source),
        defender = registry.require(target);
    const threshold = generalCheckValue({
        challenge: defender.profile.challenge,
        adverse: defender.stats.evasion,
        level: attacker.profile.level,
        attribute: attributeModifier(attacker.profile.precision),
        favorable: 0,
    });
    const result = rollCheck(threshold, (low, high) => registry.natives.randomInt(low, high));
    registry.natives.text(
        source,
        `命中檢定 ${result.success ? "成功" : "失敗"}，骰值 ${result.roll}，檢定值 ${threshold}`,
    );
    if (!result.success) registry.natives.text(target, "未命中");
    return result.success;
}
export function weaponDamage(registry: CombatRegistry, source: unit, target: unit): void {
    const attacker = registry.require(source);
    const weapon = attacker.profile.weapon;
    if (weapon === undefined) {
        registry.natives.text(source, "沒有武器");
        return;
    }
    const result = registry.damage({
        source,
        target,
        kind: DamageKind.Direct,
        output: DamageOutput.Melee,
        canCrit: true,
        contact: true,
        parts: [
            {
                amount: weapon.base,
                power: attacker.stats.meleeAttack,
                coefficient: weapon.coefficient,
                tags: ["physical"],
                channel: DefenseChannel.Physical,
                history: DamageHistory.Base,
            },
        ],
    });
    if (result !== undefined)
        registry.natives.text(target, `傷害 ${displayNumber(result.recipients[0].lifeLoss)}`);
}
export function ordinaryAttack(
    registry: CombatRegistry,
    source: unit,
    target: unit,
    reach: (this: void) => MeleeReachInput,
): "invalid" | "unarmed" | "miss" | "dodge" | "hit" {
    if (
        !registry.active(source) ||
        !registry.active(target) ||
        registry.require(source).faction === registry.require(target).faction
    )
        return "invalid";
    if (registry.require(source).profile.weapon === undefined) {
        registry.natives.text(source, "沒有武器");
        return "unarmed";
    }
    if (!attackCheck(registry, source, target)) return "miss";
    if (!meleeReach(reach()).hit) {
        registry.natives.text(target, "閃避");
        return "dodge";
    }
    weaponDamage(registry, source, target);
    return "hit";
}
