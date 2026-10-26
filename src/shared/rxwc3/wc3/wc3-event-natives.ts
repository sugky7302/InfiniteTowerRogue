import {
  AttackType, DamageType, EventNatives, Handle, PlayerHandle, TriggerHandle,
  UnitEventKind, UnitHandle, UnitInput, WeaponType,
} from "./event-natives";

interface PlayerUnitEvent extends Handle { readonly __eventid: never; readonly __playerunitevent: never; }
declare function CreateTrigger(this: void): TriggerHandle;
declare function DestroyTrigger(this: void, trigger: TriggerHandle): void;
declare function TriggerAddAction(this: void, trigger: TriggerHandle, callback: (this: void) => void): unknown;
declare function TriggerRegisterAnyUnitEventBJ(this: void, trigger: TriggerHandle, event: PlayerUnitEvent): void;
declare function TriggerRegisterPlayerChatEvent(this: void, trigger: TriggerHandle, player: PlayerHandle,
  message: string, exactMatch: boolean): unknown;
declare function Player(this: void, id: number): PlayerHandle;
declare const bj_MAX_PLAYER_SLOTS: number;
declare const EVENT_PLAYER_UNIT_DAMAGING: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_DAMAGED: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_SPELL_CHANNEL: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_SPELL_CAST: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_SPELL_EFFECT: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_SPELL_FINISH: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_SPELL_ENDCAST: PlayerUnitEvent;
declare const EVENT_PLAYER_UNIT_DEATH: PlayerUnitEvent;
declare function GetEventDamageSource(this: void): UnitHandle | undefined;
declare function GetTriggerUnit(this: void): UnitHandle;
declare function GetEventDamage(this: void): number;
declare function BlzGetEventAttackType(this: void): AttackType;
declare function BlzGetEventDamageType(this: void): DamageType;
declare function BlzGetEventWeaponType(this: void): WeaponType;
declare function BlzGetEventIsAttack(this: void): boolean;
declare function BlzSetEventDamage(this: void, value: number): void;
declare function BlzSetEventAttackType(this: void, value: AttackType): boolean;
declare function BlzSetEventDamageType(this: void, value: DamageType): boolean;
declare function BlzSetEventWeaponType(this: void, value: WeaponType): boolean;
declare function GetSpellAbilityId(this: void): number;
declare function GetSpellTargetUnit(this: void): UnitHandle | undefined;
declare function GetSpellTargetX(this: void): number;
declare function GetSpellTargetY(this: void): number;
declare function GetKillingUnit(this: void): UnitHandle | undefined;
declare function GetTriggerPlayer(this: void): PlayerHandle;
declare function GetEventPlayerChatString(this: void): string;

export const wc3EventNatives: EventNatives = {
  createTrigger() { return CreateTrigger(); },
  destroyTrigger(trigger) { DestroyTrigger(trigger); },
  addAction(trigger, callback) { TriggerAddAction(trigger, callback); },
  unwrapUnit(input: UnitInput): UnitHandle {
    // WC3 handle 是 userdata；typeof 不會將它判定為 object，故不索引 userdata。
    return typeof input === "object" && "handle" in input ? input.handle : input as UnitHandle;
  },
  registerUnitEvent(trigger, kind: UnitEventKind) {
    // 同步：以下八種玩家單位事件由共同模擬的戰鬥、施法與死亡狀態產生。
    // 全部玩家註冊相同事件，沒有 GetLocalPlayer 分支或本地介面事件。
    let event: PlayerUnitEvent;
    switch (kind) {
      case "damaging": event = EVENT_PLAYER_UNIT_DAMAGING; break;
      case "damaged": event = EVENT_PLAYER_UNIT_DAMAGED; break;
      case "spellChannel": event = EVENT_PLAYER_UNIT_SPELL_CHANNEL; break;
      case "spellCast": event = EVENT_PLAYER_UNIT_SPELL_CAST; break;
      case "spellEffect": event = EVENT_PLAYER_UNIT_SPELL_EFFECT; break;
      case "spellFinish": event = EVENT_PLAYER_UNIT_SPELL_FINISH; break;
      case "spellEndCast": event = EVENT_PLAYER_UNIT_SPELL_ENDCAST; break;
      case "death": event = EVENT_PLAYER_UNIT_DEATH; break;
    }
    TriggerRegisterAnyUnitEventBJ(trigger, event);
  },
  registerChat(trigger) {
    // 同步：WC3 把玩家聊天事件傳給全部用戶端；不是本地文字輸入框事件。
    // 全部玩家使用相同註冊。空字串的非完整比對接收全部聊天訊息。
    for (let id = 0; id < bj_MAX_PLAYER_SLOTS; id++) {
      TriggerRegisterPlayerChatEvent(trigger, Player(id), "", false);
    }
  },
  readDamage() {
    return {
      source: GetEventDamageSource(), target: GetTriggerUnit(), amount: GetEventDamage(),
      attackType: BlzGetEventAttackType(), damageType: BlzGetEventDamageType(),
      weaponType: BlzGetEventWeaponType(), isAttack: BlzGetEventIsAttack(),
    };
  },
  readSpell() {
    return {
      caster: GetTriggerUnit(), abilityId: GetSpellAbilityId(), target: GetSpellTargetUnit(),
      targetX: GetSpellTargetX(), targetY: GetSpellTargetY(),
    };
  },
  readDeath() { return { unit: GetTriggerUnit(), killer: GetKillingUnit() }; },
  readChat() { return { player: GetTriggerPlayer(), message: GetEventPlayerChatString() }; },
  setDamageAmount(value) { BlzSetEventDamage(value); },
  setDamageAttackType(value) { return BlzSetEventAttackType(value); },
  setDamageDamageType(value) { return BlzSetEventDamageType(value); },
  setDamageWeaponType(value) { return BlzSetEventWeaponType(value); },
};
