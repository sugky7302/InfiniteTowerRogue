// WC3 事件的資料快照。事件發生時複製為一般物件，因此在事件回呼結束後仍可讀取。

export type UnitEventKind =
    | "damaging"
    | "damaged"
    | "spellChannel"
    | "spellCast"
    | "spellEffect"
    | "spellFinish"
    | "spellEndCast"
    | "death"
    | "order";

export interface UnitOrderEvent {
    readonly unit: unit;
    readonly orderId: number;
    readonly kind: "immediate" | "point" | "target";
    readonly target: widget | undefined;
    readonly targetX: number;
    readonly targetY: number;
}

export interface DamageEvent {
    readonly source: unit | undefined;
    readonly target: unit;
    readonly amount: number;
    readonly attackType: attacktype;
    readonly damageType: damagetype;
    readonly weaponType: weapontype;
    readonly isAttack: boolean;
}

/** 傷害前事件。修改方法只在事件分發期間有效。 */
export interface DamagingEvent extends DamageEvent {
    setAmount(value: number): void;
    setAttackType(value: attacktype): void;
    setDamageType(value: damagetype): void;
    setWeaponType(value: weapontype): void;
}

export interface SpellEvent {
    readonly caster: unit;
    readonly abilityId: number;
    readonly target: unit | undefined;
    readonly targetX: number;
    readonly targetY: number;
}

export interface DeathEvent {
    readonly unit: unit;
    readonly killer: unit | undefined;
}

export interface ChatEvent {
    readonly player: player;
    readonly message: string;
}
