import {
    Clock,
    config,
    createWc3Events,
    DamagingEvent,
    delay,
    fromTrigger,
    map,
    Phase,
    switchMap,
    takeUntil,
    timer,
} from "../../src/shared/rxwc3";
import { damage, FakeEventNatives, fakeUnit, spell } from "./fake-event-natives";
import { FakeClockDriver } from "./fake-clock-driver";

function check(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

// 由 Lua 驗證工具轉譯並執行，也供 Node 檢查相同流程。
export function verifyEvents(): number {
    let groups = 0;
    const natives = new FakeEventNatives();
    const events = createWc3Events(natives);
    const source = fakeUnit(),
        target = fakeUnit();
    check(natives.creates === 0, "中樞沒有延遲建立。");
    const a = events.onDamaged.ofTarget(target).subscribe();
    const b = events.onDamaged.ofTarget(target).subscribe();
    check(natives.creates === 1 && events.onDamaged.routeCount() === 1, "中樞重複建立觸發器。");
    a.unsubscribe();
    b.unsubscribe();
    check(events.onDamaged.routeCount() === 0 && natives.destroys === 0, "單位 Map 清理錯誤。");
    groups++;

    const savedHandler = config.onUnhandledError;
    let errors = 0;
    config.onUnhandledError = () => {
        errors++;
    };
    try {
        const attack = {} as attacktype,
            damageKind = {} as damagetype,
            weapon = {} as weapontype;
        const amounts: number[] = [];
        let saved!: DamagingEvent;
        events.onDamaging.ofSource(source).subscribe((event) => {
            saved = event;
            amounts.push(event.amount);
            event.setAmount(event.amount / 2);
            event.setAttackType(attack);
            event.setDamageType(damageKind);
            event.setWeaponType(weapon);
        });
        events.onDamaging.subscribe((event) => {
            amounts.push(event.amount);
            event.setAmount(event.amount - 10);
        });
        let observedAttack: attacktype | undefined;
        events.onDamaging.ofTarget(target).subscribe((event) => {
            amounts.push(event.amount);
            observedAttack = event.attackType;
        });
        natives.currentDamage = damage(source, target);
        natives.emit("damaging");
        check(
            amounts.length === 3 && amounts[0] === 100 && amounts[1] === 50 && amounts[2] === 40,
            "跨路由傷害修改順序錯誤。",
        );
        check(
            observedAttack === attack &&
                natives.currentDamage.damageType === damageKind &&
                natives.currentDamage.weaponType === weapon &&
                natives.currentDamage.amount === 40 &&
                errors === 0,
            "原生修改或快照更新錯誤。",
        );
        groups++;

        const writes = natives.writes;
        saved.setAmount(1);
        saved.setAttackType(attack);
        saved.setDamageType(damageKind);
        saved.setWeaponType(weapon);
        check(
            natives.writes === writes && errors === 4 && saved.amount === 40,
            "傷害修改有效期錯誤。",
        );
        groups++;

        let delivered = 0;
        events.onDamaged.subscribe(() => {
            throw new Error("預期的訂閱者錯誤。");
        });
        events.onDamaged.subscribe(() => {
            delivered++;
        });
        natives.emit("damaged");
        natives.emit("damaged");
        check(delivered === 2 && errors === 6, "觸發器錯誤隔離失效。");
        groups++;

        const driver = new FakeClockDriver(),
            clock = new Clock(driver),
            caster = fakeUnit();
        const values: number[] = [];
        const channel = events.onSpellChannel
            .of({ handle: caster })
            .pipe(
                switchMap((event) =>
                    timer(0.8, { clock, phase: Phase.Combat }).pipe(
                        takeUntil(events.onSpellEndCast.of(caster)),
                        map(() => event.abilityId),
                    ),
                ),
            )
            .subscribe((value) => {
                values.push(value);
            });
        natives.currentSpell = spell(caster);
        natives.emit("spellChannel");
        driver.advance(0.4);
        natives.emit("spellEndCast");
        driver.advance(1);
        check(
            values.length === 0 &&
                clock.pendingCount() === 0 &&
                events.onSpellEndCast.routeCount() === 0,
            "中斷施法沒有取消計時。",
        );
        natives.emit("spellChannel");
        driver.advance(0.8);
        check(
            values.length === 1 &&
                values[0] === 1095262842 &&
                events.onSpellEndCast.routeCount() === 0,
            "完整施法的計時或清理錯誤。",
        );
        channel.unsubscribe();
        check(events.onSpellChannel.routeCount() === 0, "施法者 Map 沒有清理。");
        groups++;

        let chat = "";
        let ability = 0;
        events.onPlayerChat.pipe(delay(1, { clock })).subscribe((event) => {
            chat = event.message;
        });
        events.onSpellEffect.pipe(delay(1, { clock })).subscribe((event) => {
            ability = event.abilityId;
        });
        natives.currentChat = { player: natives.currentChat.player, message: "-load 測試" };
        natives.emit("chat");
        natives.emit("spellEffect");
        natives.currentChat = { player: natives.currentChat.player, message: "已變更" };
        natives.currentSpell = { ...spell(caster), abilityId: 0 };
        driver.advance(1);
        check(chat === "-load 測試" && ability === 1095262842, "延遲事件沒有保留快照。");
        groups++;

        const triggerNatives = new FakeEventNatives();
        let triggerValues = 0;
        const triggerSub = fromTrigger(
            (trigger) => triggerNatives.registerChat(trigger),
            () => 1,
            triggerNatives,
        ).subscribe((value) => {
            triggerValues += value;
        });
        triggerNatives.emit("chat");
        triggerSub.unsubscribe();
        triggerNatives.emit("chat");
        check(triggerValues === 1 && triggerNatives.destroys === 1, "fromTrigger 取消沒有銷毀。");
        groups++;

        const nestedNatives = new FakeEventNatives(),
            nestedEvents = createWc3Events(nestedNatives);
        const outer = fakeUnit(),
            inner = fakeUnit();
        let outerEvent!: DamagingEvent;
        nestedEvents.onDamaging.ofTarget(outer).subscribe((event) => {
            outerEvent = event;
            nestedNatives.emitDamage("damaging", damage(undefined, inner, 10));
            event.setAmount(50);
        });
        nestedEvents.onDamaging.ofTarget(inner).subscribe((event) => {
            outerEvent.setAmount(1);
            event.setAmount(5);
        });
        nestedNatives.currentDamage = damage(undefined, outer);
        nestedNatives.emit("damaging");
        check(
            errors === 7 && nestedNatives.writes === 2 && nestedNatives.currentDamage.amount === 50,
            "巢狀傷害沒有保護或恢復外層環境。",
        );
        groups++;
    } finally {
        config.onUnhandledError = savedHandler;
    }
    return groups;
}
