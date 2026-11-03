import {
    ChatEvent,
    DamageEvent,
    DeathEvent,
    SpellEvent,
    UnitEventKind,
    UnitOrderEvent,
} from "./events";
import { UnitInput } from "./inputs";

// 原生函式介面。WC3 實作在 `wc3-natives.ts`；Node 測試注入假的實作，不呼叫 WC3 原生函式。

export interface TriggerNatives {
    createTrigger(): trigger;
    destroyTrigger(trigger: trigger): void;
    addAction(trigger: trigger, callback: (this: void) => void): void;
}

export interface EventNatives extends TriggerNatives {
    unwrapUnit(input: UnitInput): unit;
    registerUnitEvent(trigger: trigger, kind: UnitEventKind): void;
    registerChat(trigger: trigger): void;
    readDamage(): DamageEvent;
    readSpell(): SpellEvent;
    readOrder(): UnitOrderEvent;
    readDeath(): DeathEvent;
    readChat(): ChatEvent;
    setDamageAmount(value: number): void;
    setDamageAttackType(value: attacktype): boolean;
    setDamageDamageType(value: damagetype): boolean;
    setDamageWeaponType(value: weapontype): boolean;
}

/** 一個實例代表一個用戶端。測試可注入假的網路。 */
export interface SyncNatives extends TriggerNatives {
    getLocalPlayer(): player;
    registerSync(trigger: trigger, player: player, prefix: string): void;
    sendSync(prefix: string, data: string): boolean;
    readSyncData(): string;
}
