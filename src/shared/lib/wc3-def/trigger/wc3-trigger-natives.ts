import { UnitEventKind } from "../types/events";
import { unwrapUnit } from "../types/inputs";
import { EventNatives, SyncNatives } from "./trigger-natives";

// 原生函式介面的 WC3 實作。原生函式與型別來自 war3-types-strict 的全域宣告。
// 載入時不呼叫原生函式。
// `!`：在事件回呼中，GetTriggerUnit 與 Player 一定有值；war3-types-strict 的宣告包含 undefined。

export const wc3EventNatives: EventNatives = {
    createTrigger() {
        return CreateTrigger();
    },
    destroyTrigger(trigger) {
        DestroyTrigger(trigger);
    },
    addAction(trigger, callback) {
        TriggerAddAction(trigger, callback);
    },
    // 介面方法在 Lua 中會收到 self；一般函式沒有 self，所以用箭頭函式包裝。
    unwrapUnit: (input) => unwrapUnit(input),
    registerUnitEvent(trigger, kind: UnitEventKind) {
        // 同步：玩家單位事件由共同模擬的命令、戰鬥、施法與死亡狀態產生。
        // 全部玩家註冊相同事件，沒有 GetLocalPlayer 分支或本地介面事件。
        let event: playerunitevent;
        switch (kind) {
            case "order":
                TriggerRegisterAnyUnitEventBJ(trigger, EVENT_PLAYER_UNIT_ISSUED_ORDER);
                TriggerRegisterAnyUnitEventBJ(trigger, EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER);
                // ISSUED_UNIT_ORDER 與 ISSUED_TARGET_ORDER 是同一事件，只註冊一次。
                TriggerRegisterAnyUnitEventBJ(trigger, EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER);
                return;
            case "damaging":
                event = EVENT_PLAYER_UNIT_DAMAGING;
                break;
            case "damaged":
                event = EVENT_PLAYER_UNIT_DAMAGED;
                break;
            case "spellChannel":
                event = EVENT_PLAYER_UNIT_SPELL_CHANNEL;
                break;
            case "spellCast":
                event = EVENT_PLAYER_UNIT_SPELL_CAST;
                break;
            case "spellEffect":
                event = EVENT_PLAYER_UNIT_SPELL_EFFECT;
                break;
            case "spellFinish":
                event = EVENT_PLAYER_UNIT_SPELL_FINISH;
                break;
            case "spellEndCast":
                event = EVENT_PLAYER_UNIT_SPELL_ENDCAST;
                break;
            case "death":
                event = EVENT_PLAYER_UNIT_DEATH;
                break;
        }
        TriggerRegisterAnyUnitEventBJ(trigger, event);
    },
    registerChat(trigger) {
        // 同步：WC3 把玩家聊天事件傳給全部用戶端；不是本地文字輸入框事件。
        // 全部玩家使用相同註冊。空字串的非完整比對接收全部聊天訊息。
        for (let id = 0; id < bj_MAX_PLAYER_SLOTS; id++) {
            TriggerRegisterPlayerChatEvent(trigger, Player(id)!, "", false);
        }
    },
    readDamage() {
        return {
            source: GetEventDamageSource(),
            target: GetTriggerUnit()!,
            amount: GetEventDamage(),
            attackType: BlzGetEventAttackType()!,
            damageType: BlzGetEventDamageType()!,
            weaponType: BlzGetEventWeaponType()!,
            isAttack: BlzGetEventIsAttack(),
        };
    },
    readSpell() {
        return {
            caster: GetTriggerUnit()!,
            abilityId: GetSpellAbilityId(),
            target: GetSpellTargetUnit(),
            targetX: GetSpellTargetX(),
            targetY: GetSpellTargetY(),
        };
    },
    readOrder() {
        const event = GetTriggerEventId();
        const kind =
            event === EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER
                ? "point"
                : event === EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER
                  ? "target"
                  : "immediate";
        return {
            unit: GetOrderedUnit()!,
            orderId: GetIssuedOrderId(),
            kind,
            target: kind === "target" ? GetOrderTarget() : undefined,
            targetX: kind === "point" ? GetOrderPointX() : 0,
            targetY: kind === "point" ? GetOrderPointY() : 0,
        };
    },
    readDeath() {
        return { unit: GetTriggerUnit()!, killer: GetKillingUnit() };
    },
    readChat() {
        return { player: GetTriggerPlayer()!, message: GetEventPlayerChatString()! };
    },
    setDamageAmount(value) {
        BlzSetEventDamage(value);
    },
    setDamageAttackType(value) {
        return BlzSetEventAttackType(value);
    },
    setDamageDamageType(value) {
        return BlzSetEventDamageType(value);
    },
    setDamageWeaponType(value) {
        return BlzSetEventWeaponType(value);
    },
};

/** 同步事件在全部用戶端送達相同資料。 */
export const wc3SyncNatives: SyncNatives = {
    getLocalPlayer: () => GetLocalPlayer(),
    createTrigger: () => CreateTrigger(),
    destroyTrigger: (trigger) => DestroyTrigger(trigger),
    addAction: (trigger, callback) => {
        TriggerAddAction(trigger, callback);
    },
    registerSync: (trigger, player, prefix) => {
        BlzTriggerRegisterPlayerSyncEvent(trigger, player, prefix, false);
    },
    sendSync: (prefix, data) => BlzSendSyncData(prefix, data),
    readSyncData: () => BlzGetTriggerSyncData()!,
};
