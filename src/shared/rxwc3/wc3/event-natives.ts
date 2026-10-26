// 結構與 war3-types-strict 相容；此模組不依賴全域 WC3 型別。
export interface Handle { readonly __handle: never; }
export interface UnitHandle extends Handle {
  readonly __agent: never;
  readonly __widget: never;
  readonly __unit: never;
}
export interface PlayerHandle extends Handle { readonly __agent: never; readonly __player: never; }
export interface TriggerHandle extends Handle { readonly __agent: never; readonly __trigger: never; }
export interface AttackType extends Handle { readonly __attacktype: never; }
export interface DamageType extends Handle { readonly __damagetype: never; }
export interface WeaponType extends Handle { readonly __weapontype: never; }
export type UnitInput = UnitHandle | { readonly handle: UnitHandle };
export type UnitEventKind = "damaging" | "damaged" | "spellChannel" | "spellCast" |
  "spellEffect" | "spellFinish" | "spellEndCast" | "death";

export interface DamageEvent {
  readonly source: UnitHandle | undefined;
  readonly target: UnitHandle;
  readonly amount: number;
  readonly attackType: AttackType;
  readonly damageType: DamageType;
  readonly weaponType: WeaponType;
  readonly isAttack: boolean;
}

export interface DamagingEvent extends DamageEvent {
  setAmount(value: number): void;
  setAttackType(value: AttackType): void;
  setDamageType(value: DamageType): void;
  setWeaponType(value: WeaponType): void;
}

export interface SpellEvent {
  readonly caster: UnitHandle;
  readonly abilityId: number;
  readonly target: UnitHandle | undefined;
  readonly targetX: number;
  readonly targetY: number;
}

export interface DeathEvent {
  readonly unit: UnitHandle;
  readonly killer: UnitHandle | undefined;
}

export interface ChatEvent { readonly player: PlayerHandle; readonly message: string; }

export interface TriggerNatives {
  createTrigger(): TriggerHandle;
  destroyTrigger(trigger: TriggerHandle): void;
  addAction(trigger: TriggerHandle, callback: (this: void) => void): void;
}

export interface EventNatives extends TriggerNatives {
  unwrapUnit(input: UnitInput): UnitHandle;
  registerUnitEvent(trigger: TriggerHandle, kind: UnitEventKind): void;
  registerChat(trigger: TriggerHandle): void;
  readDamage(): DamageEvent;
  readSpell(): SpellEvent;
  readDeath(): DeathEvent;
  readChat(): ChatEvent;
  setDamageAmount(value: number): void;
  setDamageAttackType(value: AttackType): boolean;
  setDamageDamageType(value: DamageType): boolean;
  setDamageWeaponType(value: WeaponType): boolean;
}
