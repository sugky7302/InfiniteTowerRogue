import { reportUnhandledError } from "../core/config";
import { Observable } from "../core/observable";
import { EventHub } from "./event-hub";
import {
    ChatEvent,
    DamageEvent,
    DamagingEvent,
    DeathEvent,
    SpellEvent,
    UnitEventKind,
} from "@shared/wc3-def/events";
import { EventNatives } from "@shared/wc3-def/natives";
import { UnitInput } from "@shared/wc3-def/inputs";
import { wc3EventNatives } from "@shared/wc3-def/wc3-natives";

interface DispatchContext {
    current: unknown;
}

class MutableDamage implements DamagingEvent {
    public readonly source;
    public readonly target;
    public readonly isAttack;
    private active = true;
    private value: number;
    private attack: attacktype;
    private damage: damagetype;
    private weapon: weapontype;

    public constructor(
        data: DamageEvent,
        private readonly natives: EventNatives,
        private readonly context: DispatchContext,
    ) {
        this.source = data.source;
        this.target = data.target;
        this.isAttack = data.isAttack;
        this.value = data.amount;
        this.attack = data.attackType;
        this.damage = data.damageType;
        this.weapon = data.weaponType;
    }

    public get amount(): number {
        return this.value;
    }
    public get attackType(): attacktype {
        return this.attack;
    }
    public get damageType(): damagetype {
        return this.damage;
    }
    public get weaponType(): weapontype {
        return this.weapon;
    }
    public expire(): void {
        this.active = false;
    }

    private canModify(): boolean {
        if (this.active && this.context.current === this) return true;
        reportUnhandledError(new Error("傷害修改只能在目前傷害事件的分發期間執行。"));
        return false;
    }

    public setAmount(value: number): void {
        if (!this.canModify()) return;
        if (!Number.isFinite(value) || Math.abs(value) > 2147483000) {
            reportUnhandledError(new Error("傷害量必須是範圍內的有限數值。"));
            return;
        }
        this.natives.setDamageAmount(value);
        this.value = value;
    }
    public setAttackType(value: attacktype): void {
        if (this.canModify() && this.natives.setDamageAttackType(value)) this.attack = value;
    }
    public setDamageType(value: damagetype): void {
        if (this.canModify() && this.natives.setDamageDamageType(value)) this.damage = value;
    }
    public setWeaponType(value: weapontype): void {
        if (this.canModify() && this.natives.setDamageWeaponType(value)) this.weapon = value;
    }
}

export class DamageSource<T extends DamageEvent> extends EventHub<T> {
    public ofTarget(unit: UnitInput): Observable<T> {
        return this.select(unit);
    }
    public ofSource(unit: UnitInput): Observable<T> {
        return this.select(unit, true);
    }
}

export class UnitSource<T> extends EventHub<T> {
    public of(unit: UnitInput): Observable<T> {
        return this.select(unit);
    }
}

export function createWc3Events(natives: EventNatives) {
    const context: DispatchContext = { current: undefined };
    const dispatch = <T>(hub: EventHub<T>, value: T): void => {
        const previous = context.current;
        context.current = value;
        try {
            hub.dispatch(value);
        } finally {
            context.current = previous;
        }
    };
    // 同步：DAMAGING 與 DAMAGED 是共同戰鬥模擬的原生事件。依訂閱順序即時分發。
    const onDamaging = new DamageSource<DamagingEvent>(
        natives,
        (trigger) => natives.registerUnitEvent(trigger, "damaging"),
        (hub) => {
            if (!hub.hasSubscribers()) return;
            const value = new MutableDamage(natives.readDamage(), natives, context);
            try {
                dispatch(hub, value);
            } finally {
                value.expire();
            }
        },
        (value) => value.target,
        (value) => value.source,
    );
    const onDamaged = new DamageSource<DamageEvent>(
        natives,
        (trigger) => natives.registerUnitEvent(trigger, "damaged"),
        (hub) => {
            if (hub.hasSubscribers()) dispatch(hub, natives.readDamage());
        },
        (value) => value.target,
        (value) => value.source,
    );
    const spell = (kind: UnitEventKind): UnitSource<SpellEvent> =>
        new UnitSource<SpellEvent>(
            natives,
            (trigger) => natives.registerUnitEvent(trigger, kind),
            (hub) => {
                if (hub.hasSubscribers()) dispatch(hub, natives.readSpell());
            },
            (value) => value.caster,
        );
    // 同步：五個階段都來自共同施法命令與模擬，未使用本地玩家條件。
    const onSpellChannel = spell("spellChannel");
    const onSpellCast = spell("spellCast");
    const onSpellEffect = spell("spellEffect");
    const onSpellFinish = spell("spellFinish");
    const onSpellEndCast = spell("spellEndCast");
    // 同步：死亡由共同單位狀態產生。此來源不會自動結束單位訂閱。
    const onUnitDeath = new UnitSource<DeathEvent>(
        natives,
        (trigger) => natives.registerUnitEvent(trigger, "death"),
        (hub) => {
            if (hub.hasSubscribers()) dispatch(hub, natives.readDeath());
        },
        (value) => value.unit,
    );
    // 同步：原生聊天事件傳送給全部用戶端。不是本地介面輸入。
    const onPlayerChat = new EventHub<ChatEvent>(
        natives,
        (trigger) => natives.registerChat(trigger),
        (hub) => {
            if (hub.hasSubscribers()) dispatch(hub, natives.readChat());
        },
        () => undefined,
    );
    return {
        onDamaging,
        onDamaged,
        onSpellChannel,
        onSpellCast,
        onSpellEffect,
        onSpellFinish,
        onSpellEndCast,
        onUnitDeath,
        onPlayerChat,
    };
}

// 僅建立純邏輯物件；第一次訂閱才呼叫原生函式。
export const {
    onDamaging,
    onDamaged,
    onSpellChannel,
    onSpellCast,
    onSpellEffect,
    onSpellFinish,
    onSpellEndCast,
    onUnitDeath,
    onPlayerChat,
} = createWc3Events(wc3EventNatives);
