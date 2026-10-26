import {
  AttackType, ChatEvent, DamageEvent, DamageType, DeathEvent, EventNatives, PlayerHandle,
  SpellEvent, TriggerHandle, UnitEventKind, UnitHandle, UnitInput, WeaponType,
} from "../../src/shared/rxwc3/wc3/event-natives";

export function fakeUnit(): UnitHandle { return {} as UnitHandle; }
export const attackType = {} as AttackType;
export const damageType = {} as DamageType;
export const weaponType = {} as WeaponType;

export function damage(source = fakeUnit(), target = fakeUnit(), amount = 100): DamageEvent {
  return { source, target, amount, attackType, damageType, weaponType, isAttack: true };
}

export function spell(caster = fakeUnit()): SpellEvent {
  return { caster, abilityId: 1095262842, target: undefined, targetX: 10, targetY: 20 };
}

interface FakeTrigger {
  callback?: (this: void) => void;
  kind?: UnitEventKind | "chat";
  destroyed: boolean;
}

// Node 與 Lua 共用此假介面。所有資料都由測試明確提供。
export class FakeEventNatives implements EventNatives {
  public readonly triggers = new Map<TriggerHandle, FakeTrigger>();
  public creates = 0;
  public destroys = 0;
  public reads = 0;
  public writes = 0;
  public rejectType = false;
  public failRead = false;
  public failRegister = false;
  public currentDamage = damage();
  public currentSpell = spell();
  public currentDeath: DeathEvent = { unit: fakeUnit(), killer: undefined };
  public currentChat: ChatEvent = { player: {} as PlayerHandle, message: "" };

  public createTrigger(): TriggerHandle {
    const trigger = {} as TriggerHandle;
    this.triggers.set(trigger, { destroyed: false });
    this.creates++;
    return trigger;
  }
  public destroyTrigger(trigger: TriggerHandle): void {
    this.triggers.get(trigger)!.destroyed = true;
    this.destroys++;
  }
  public addAction(trigger: TriggerHandle, callback: (this: void) => void): void {
    this.triggers.get(trigger)!.callback = callback;
  }
  public unwrapUnit(input: UnitInput): UnitHandle { return "handle" in input ? input.handle : input; }
  public registerUnitEvent(trigger: TriggerHandle, kind: UnitEventKind): void {
    if (this.failRegister) throw new Error("預期的註冊錯誤。");
    this.triggers.get(trigger)!.kind = kind;
  }
  public registerChat(trigger: TriggerHandle): void { this.triggers.get(trigger)!.kind = "chat"; }
  private read(): void {
    this.reads++;
    if (this.failRead) throw new Error("預期的原生讀取錯誤。");
  }
  public readDamage(): DamageEvent { this.read(); return { ...this.currentDamage }; }
  public readSpell(): SpellEvent { this.read(); return { ...this.currentSpell }; }
  public readDeath(): DeathEvent { this.read(); return { ...this.currentDeath }; }
  public readChat(): ChatEvent { this.read(); return { ...this.currentChat }; }
  public setDamageAmount(value: number): void {
    this.writes++;
    this.currentDamage = { ...this.currentDamage, amount: value };
  }
  public setDamageAttackType(value: AttackType): boolean {
    this.writes++;
    if (!this.rejectType) this.currentDamage = { ...this.currentDamage, attackType: value };
    return !this.rejectType;
  }
  public setDamageDamageType(value: DamageType): boolean {
    this.writes++;
    if (!this.rejectType) this.currentDamage = { ...this.currentDamage, damageType: value };
    return !this.rejectType;
  }
  public setDamageWeaponType(value: WeaponType): boolean {
    this.writes++;
    if (!this.rejectType) this.currentDamage = { ...this.currentDamage, weaponType: value };
    return !this.rejectType;
  }
  public emit(kind: UnitEventKind | "chat"): void {
    for (const trigger of this.triggers.values()) {
      if (!trigger.destroyed && trigger.kind === kind) trigger.callback!();
    }
  }
  public emitDamage(kind: "damaging" | "damaged", value: DamageEvent): void {
    const previous = this.currentDamage;
    this.currentDamage = value;
    try { this.emit(kind); } finally { this.currentDamage = previous; }
  }
}
