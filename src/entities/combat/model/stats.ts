import { Defense } from "./damage";
import { DamageAttacker, DamageTarget, DamageResult } from "./damage-event";

/** 戰鬥數值查詢。屬於遊戲規則，所以不放在 shared 的原生函式介面中。實作由組合層提供。 */
export interface CombatStats {
    commitDamage?(source: unit, target: unit, result: DamageResult): void;
    damageTarget?(target: unit): DamageTarget;
    damageAttacker?(source: unit): DamageAttacker;
    defense(target: unit): Defense;
    setShield(target: unit, value: number): void;
    /** 挑戰等級，用於技能檢定。 */
    challenge(target: unit): number;
    /** 迴避，用於技能檢定的不利因素。 */
    evasion(target: unit): number;
    combustible(target: unit): boolean;
}
