import {
    AbilityNatives,
    EffectNatives,
    RandomNatives,
    UnitAreaNatives,
    UnitDamageNatives,
    UnitNatives,
} from "@shared/wc3-def";

/** 技能系統需要的原生操作。只包裝原生操作；戰鬥數值由 `CombatStats` 另外提供。 */
export type SkillNatives = Pick<
    UnitNatives,
    | "stop"
    | "x"
    | "y"
    | "alive"
    | "enemyVisible"
    | "speed"
    | "setSpeed"
    | "mana"
    | "setMana"
    | "regen"
    | "setRegen"
> &
    UnitDamageNatives &
    UnitAreaNatives &
    Pick<AbilityNatives, "cooldown" | "startCooldown" | "disableAbility"> &
    EffectNatives &
    RandomNatives;
