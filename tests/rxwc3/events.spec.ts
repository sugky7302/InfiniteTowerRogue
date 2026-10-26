import { strict as assert } from "node:assert";
import { test as nodeTest } from "node:test";
import {
    Clock,
    config,
    createWc3Events,
    DamageEvent,
    DamagingEvent,
    delay,
    fromTrigger,
    map,
    Phase,
    Subject,
    Subscription,
    switchMap,
    Subscriber,
    take,
    takeUntil,
    timer,
} from "../../src/shared/rxwc3";
import { damage, FakeEventNatives, fakeUnit, spell } from "./fake-event-natives";
import { FakeClockDriver } from "./fake-clock-driver";
import { wc3EventNatives } from "@shared/wc3-def/wc3-natives";
import { verifyEvents } from "./events-lua.spec";

// 訂閱者內的斷言會被錯誤隔離捕捉；測試結束時也必須檢查這些錯誤。
function test(name: string, run: () => void): void {
    nodeTest(name, () => {
        const saved = config.onUnhandledError;
        const unexpected: unknown[] = [];
        config.onUnhandledError = (error) => {
            unexpected.push(error);
        };
        try {
            run();
            assert.deepEqual(unexpected, []);
        } finally {
            config.onUnhandledError = saved;
        }
    });
}

function setup() {
    const natives = new FakeEventNatives();
    return { natives, ...createWc3Events(natives) };
}

function withErrors(run: (errors: unknown[]) => void): void {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    try {
        run(errors);
    } finally {
        config.onUnhandledError = saved;
    }
}

test("Node 可執行 Lua 共用的八組事件驗證流程", () => {
    assert.equal(verifyEvents(), 8);
});

test("事件中樞延遲建立，各種單位事件最多保留一個觸發器", () => {
    const s = setup();
    const unit = fakeUnit();
    const selected = s.onDamaged.ofTarget(unit);
    assert.equal(s.natives.creates, 0);
    assert.equal(s.onDamaged.routeCount(), 0);
    const owner = new Subscription();
    for (const source of [
        s.onDamaging,
        s.onDamaged,
        s.onSpellChannel,
        s.onSpellCast,
        s.onSpellEffect,
        s.onSpellFinish,
        s.onSpellEndCast,
        s.onUnitDeath,
    ]) {
        owner.add(source.subscribe());
        owner.add(source.subscribe());
    }
    owner.add(selected.subscribe());
    assert.equal(s.natives.creates, 8);
    owner.unsubscribe();
    selected.subscribe().unsubscribe();
    assert.equal(s.natives.creates, 8);
    assert.equal(s.natives.destroys, 0);
});

test("傷害依來源與目標分發，接受原生單位與 w3ts 形狀", () => {
    const s = setup();
    const source = fakeUnit(),
        target = fakeUnit(),
        other = fakeUnit();
    const values: string[] = [];
    s.onDamaged.ofSource({ handle: source }).subscribe(() => values.push("來源"));
    s.onDamaged.ofTarget(target).subscribe(() => values.push("目標"));
    s.onDamaged.ofTarget(other).subscribe(() => assert.fail("不可送給其他單位"));
    s.onDamaged.subscribe(() => values.push("全域"));
    s.natives.emitDamage("damaged", damage(source, target));
    assert.deepEqual(values, ["來源", "目標", "全域"]);
});

test("最後一個訂閱取消才移除單位 Map，保留的串流可以重新訂閱", () => {
    const s = setup();
    const unit = fakeUnit();
    const selected = s.onDamaging.ofSource(unit);
    const a = selected.subscribe(),
        b = selected.subscribe();
    assert.equal(s.onDamaging.routeCount(true), 1);
    a.unsubscribe();
    assert.equal(s.onDamaging.routeCount(true), 1);
    b.unsubscribe();
    assert.equal(s.onDamaging.routeCount(true), 0);
    const c = selected.subscribe();
    assert.equal(s.onDamaging.routeCount(true), 1);
    c.unsubscribe();
    assert.equal(s.onDamaging.hasSubscribers(), false);
});

test("傷害、施法、死亡與聊天快照在 delay 之後仍可讀取", () => {
    const s = setup(),
        driver = new FakeClockDriver(),
        clock = new Clock(driver);
    const originalDamage = damage(),
        originalSpell = spell();
    const death = { unit: fakeUnit(), killer: fakeUnit() };
    const chat = { player: {} as player, message: "-load 測試" };
    const values: unknown[] = [];
    s.onDamaged.pipe(delay(1, { clock })).subscribe((e) => values.push(e));
    s.onSpellEffect.pipe(delay(1, { clock })).subscribe((e) => values.push(e));
    s.onUnitDeath.pipe(delay(1, { clock })).subscribe((e) => values.push(e));
    s.onPlayerChat.pipe(delay(1, { clock })).subscribe((e) => values.push(e));
    s.natives.currentDamage = originalDamage;
    s.natives.emit("damaged");
    s.natives.currentSpell = originalSpell;
    s.natives.emit("spellEffect");
    s.natives.currentDeath = death;
    s.natives.emit("death");
    s.natives.currentChat = chat;
    s.natives.emit("chat");
    s.natives.currentDamage = damage();
    s.natives.currentSpell = spell();
    s.natives.currentDeath = { unit: fakeUnit(), killer: undefined };
    s.natives.currentChat = { player: {} as player, message: "已變更" };
    driver.advance(1);
    assert.deepEqual(values, [originalDamage, originalSpell, death, chat]);
    assert.notEqual(values[0], originalDamage);
    assert.notEqual(values[1], originalSpell);
});

test("可修改傷害依全域、來源與目標的訂閱順序傳遞", () => {
    const s = setup(),
        source = fakeUnit(),
        target = fakeUnit();
    const amounts: number[] = [];
    s.onDamaging.ofSource(source).subscribe((e) => {
        amounts.push(e.amount);
        e.setAmount(e.amount / 2);
    });
    s.onDamaging.subscribe((e) => {
        amounts.push(e.amount);
        e.setAmount(e.amount - 10);
    });
    s.onDamaging.ofTarget(target).subscribe((e) => amounts.push(e.amount));
    s.natives.currentDamage = damage(source, target);
    s.natives.emit("damaging");
    assert.deepEqual(amounts, [100, 50, 40]);
    assert.equal(s.natives.currentDamage.amount, 40);
    assert.equal(s.natives.writes, 2);
});

test("攻擊、傷害與武器類型修改更新後續訂閱者的快照", () => {
    const s = setup();
    const attack = {} as attacktype,
        damageKind = {} as damagetype,
        weapon = {} as weapontype;
    s.onDamaging.subscribe((e) => {
        e.setAttackType(attack);
        e.setDamageType(damageKind);
        e.setWeaponType(weapon);
    });
    s.onDamaging.subscribe((e) => {
        assert.equal(e.attackType, attack);
        assert.equal(e.damageType, damageKind);
        assert.equal(e.weaponType, weapon);
    });
    s.natives.emit("damaging");
    assert.equal(s.natives.writes, 3);
    assert.equal(s.natives.currentDamage.attackType, attack);
});

test("原生函式拒絕類型修改時保留舊快照", () => {
    const s = setup(),
        before = s.natives.currentDamage;
    s.natives.rejectType = true;
    s.onDamaging.subscribe((e) => {
        e.setAttackType({} as attacktype);
        e.setDamageType({} as damagetype);
        e.setWeaponType({} as weapontype);
        assert.equal(e.attackType, before.attackType);
        assert.equal(e.damageType, before.damageType);
        assert.equal(e.weaponType, before.weaponType);
    });
    s.natives.emit("damaging");
    assert.equal(s.natives.writes, 3);
});

test("分發後全部修改方法被拒絕並各回報一次，不改動原生值", () =>
    withErrors((errors) => {
        const s = setup();
        let saved!: DamagingEvent;
        s.onDamaging.subscribe((e) => {
            saved = e;
        });
        s.natives.emit("damaging");
        saved.setAmount(1);
        saved.setAttackType({} as attacktype);
        saved.setDamageType({} as damagetype);
        saved.setWeaponType({} as weapontype);
        assert.equal(s.natives.writes, 0);
        assert.equal(saved.amount, 100);
        assert.equal(errors.length, 4);
    }));

test("可修改傷害經過 delay 後保留資料，但拒絕修改", () =>
    withErrors((errors) => {
        const s = setup(),
            driver = new FakeClockDriver(),
            clock = new Clock(driver);
        let amount = 0;
        s.onDamaging.pipe(delay(1, { clock })).subscribe((e) => {
            amount = e.amount;
            e.setAmount(1);
        });
        s.natives.emit("damaging");
        s.natives.currentDamage = damage(undefined, undefined, 200);
        driver.advance(1);
        assert.equal(amount, 100);
        assert.equal(s.natives.writes, 0);
        assert.equal(errors.length, 1);
    }));

test("巢狀傷害禁止修改外層，返回外層後可以繼續修改", () =>
    withErrors((errors) => {
        const s = setup(),
            outer = fakeUnit(),
            inner = fakeUnit();
        let outerEvent!: DamagingEvent;
        const values: number[] = [];
        s.onDamaging.ofTarget(outer).subscribe((e) => {
            outerEvent = e;
            s.natives.emitDamage("damaging", damage(undefined, inner, 10));
            e.setAmount(50);
        });
        s.onDamaging.ofTarget(inner).subscribe((e) => {
            outerEvent.setAmount(1);
            e.setAmount(5);
            values.push(e.amount);
        });
        s.onDamaging.ofTarget(outer).subscribe((e) => values.push(e.amount));
        s.natives.emitDamage("damaging", damage(undefined, outer));
        assert.deepEqual(values, [5, 50]);
        assert.equal(errors.length, 1);
        assert.equal(s.natives.writes, 2);
    }));

test("其他巢狀事件也不能使用外層傷害修改方法", () =>
    withErrors((errors) => {
        const s = setup();
        let saved!: DamagingEvent;
        s.onSpellEffect.subscribe(() => saved.setAmount(1));
        s.onDamaging.subscribe((e) => {
            saved = e;
            s.natives.emit("spellEffect");
            e.setAmount(50);
        });
        s.natives.emit("damaging");
        assert.equal(errors.length, 1);
        assert.equal(s.natives.currentDamage.amount, 50);
    }));

test("訂閱者錯誤不影響其他訂閱者與後續觸發", () =>
    withErrors((errors) => {
        const s = setup();
        let received = 0;
        s.onDamaging.subscribe(() => {
            throw new Error("預期的訂閱者錯誤。");
        });
        s.onDamaging.subscribe((e) => {
            e.setAmount(50);
            received++;
        });
        s.natives.emit("damaging");
        s.natives.emit("damaging");
        assert.equal(errors.length, 2);
        assert.equal(received, 2);
        assert.equal(s.natives.creates, 1);
    }));

test("原生讀取錯誤由回呼回報，恢復後仍可分發", () =>
    withErrors((errors) => {
        const s = setup();
        let received = 0;
        s.onSpellCast.subscribe(() => {
            received++;
        });
        s.natives.failRead = true;
        s.natives.emit("spellCast");
        s.natives.failRead = false;
        s.natives.emit("spellCast");
        assert.equal(errors.length, 1);
        assert.equal(received, 1);
    }));

test("分發中取消與新增訂閱不改變目前分發的邊界", () => {
    const s = setup(),
        unit = fakeUnit(),
        owner = new Subscription();
    const values: string[] = [];
    let second!: Subscription,
        added = false;
    owner.add(
        s.onDamaged.subscribe(() => {
            values.push("第一");
            second.unsubscribe();
            if (!added) {
                added = true;
                owner.add(s.onDamaged.ofTarget(unit).subscribe(() => values.push("新增")));
            }
        }),
    );
    second = s.onDamaged.ofTarget(unit).subscribe(() => values.push("取消"));
    s.natives.emitDamage("damaged", damage(undefined, unit));
    assert.deepEqual(values, ["第一"]);
    s.natives.emitDamage("damaged", damage(undefined, unit));
    assert.deepEqual(values, ["第一", "第一", "新增"]);
    owner.unsubscribe();
    assert.equal(s.onDamaged.routeCount(), 0);
});

test("沒有訂閱時保留觸發器但不建立快照", () => {
    const s = setup();
    const sub = s.onDamaged.subscribe();
    sub.unsubscribe();
    s.natives.emit("damaged");
    assert.equal(s.natives.reads, 0);
    assert.equal(s.natives.destroys, 0);
});

test("死亡不結束單位串流，重複死亡仍送出值", () => {
    const s = setup(),
        unit = fakeUnit();
    let calls = 0,
        completed = false;
    const sub = s.onUnitDeath.of(unit).subscribe({
        next: () => {
            calls++;
        },
        complete: () => {
            completed = true;
        },
    });
    s.natives.currentDeath = { unit, killer: undefined };
    s.natives.emit("death");
    s.natives.emit("death");
    assert.equal(calls, 2);
    assert.equal(completed, false);
    assert.equal(sub.closed, false);
    sub.unsubscribe();
    assert.equal(s.onUnitDeath.routeCount(), 0);
});

test("五個施法事件依施法者分發且保存全部欄位", () => {
    const s = setup(),
        caster = fakeUnit(),
        target = fakeUnit();
    const expected = { ...spell(caster), target };
    const values: unknown[] = [];
    for (const source of [
        s.onSpellChannel,
        s.onSpellCast,
        s.onSpellEffect,
        s.onSpellFinish,
        s.onSpellEndCast,
    ]) {
        source.of(caster).subscribe((e) => values.push(e));
        source.of(fakeUnit()).subscribe(() => assert.fail("不可送給其他施法者"));
    }
    s.natives.currentSpell = expected;
    for (const kind of [
        "spellChannel",
        "spellCast",
        "spellEffect",
        "spellFinish",
        "spellEndCast",
    ] as const)
        s.natives.emit(kind);
    assert.equal(values.length, 5);
    for (const value of values) assert.deepEqual(value, expected);
});

test("聊天共用觸發器並保存玩家與全部指令文字", () => {
    const s = setup(),
        player = {} as player;
    const values: string[] = [];
    s.onPlayerChat.subscribe((e) => {
        assert.equal(e.player, player);
        values.push(e.message);
    });
    s.onPlayerChat.subscribe();
    for (const message of ["你好", "-save", "-load 測試", "-lang zh-TW"]) {
        s.natives.currentChat = { player, message };
        s.natives.emit("chat");
    }
    assert.deepEqual(values, ["你好", "-save", "-load 測試", "-lang zh-TW"]);
    assert.equal(s.natives.creates, 1);
});

test("fromTrigger 每次訂閱建立觸發器，取消只銷毀一次", () => {
    const natives = new FakeEventNatives(),
        values: number[] = [];
    const source = fromTrigger(
        (t) => natives.registerChat(t),
        () => 7,
        natives,
    );
    assert.equal(natives.creates, 0);
    const a = source.subscribe((v) => values.push(v)),
        b = source.subscribe((v) => values.push(v));
    natives.emit("chat");
    a.unsubscribe();
    a.unsubscribe();
    natives.emit("chat");
    b.unsubscribe();
    assert.deepEqual(values, [7, 7, 7]);
    assert.equal(natives.creates, 2);
    assert.equal(natives.destroys, 2);
});

test("fromTrigger 讀取錯誤不會停止後續事件", () =>
    withErrors((errors) => {
        const natives = new FakeEventNatives();
        let failed = true,
            calls = 0;
        const sub = fromTrigger(
            (t) => natives.registerChat(t),
            () => {
                if (failed) throw new Error("預期的讀取錯誤。");
                return 1;
            },
            natives,
        ).subscribe(() => {
            calls++;
        });
        natives.emit("chat");
        failed = false;
        natives.emit("chat");
        sub.unsubscribe();
        assert.equal(errors.length, 1);
        assert.equal(calls, 1);
        assert.equal(natives.destroys, 1);
    }));

test("fromTrigger 註冊失敗及同步 take 完成均清理觸發器", () => {
    const natives = new FakeEventNatives();
    let errors = 0;
    fromTrigger(
        () => {
            throw new Error("預期的註冊錯誤。");
        },
        () => 1,
        natives,
    ).subscribe({
        error: () => {
            errors++;
        },
    });
    assert.equal(errors, 1);
    assert.equal(natives.destroys, 1);
    fromTrigger(
        (t) => {
            natives.registerChat(t);
            natives.emit("chat");
        },
        () => 1,
        natives,
    )
        .pipe(take(1))
        .subscribe();
    assert.equal(natives.destroys, 2);
});

test("takeUntil 與 switchMap 清理來源和目標 Map", () => {
    const s = setup(),
        source = fakeUnit(),
        target = fakeUnit(),
        other = fakeUnit();
    const selection = new Subject<typeof target>(),
        stop = new Subject<void>();
    const sub = selection
        .pipe(
            switchMap((unit) => s.onDamaged.ofTarget(unit)),
            takeUntil(stop),
        )
        .subscribe();
    selection.next(target);
    assert.equal(s.onDamaged.routeCount(), 1);
    selection.next(other);
    assert.equal(s.onDamaged.routeCount(), 1);
    const bySource = s.onDamaged.ofSource(source).pipe(takeUntil(stop)).subscribe();
    stop.next();
    assert.equal(sub.closed, true);
    assert.equal(bySource.closed, true);
    assert.equal(s.onDamaged.routeCount(), 0);
    assert.equal(s.onDamaged.routeCount(true), 0);
});

test("施法範例在中斷時取消，持續 0.8 秒後送出原快照", () => {
    const s = setup(),
        driver = new FakeClockDriver(),
        clock = new Clock(driver),
        caster = fakeUnit();
    const values: number[] = [];
    const sub = s.onSpellChannel
        .of(caster)
        .pipe(
            switchMap((e) =>
                timer(0.8, { clock, phase: Phase.Combat }).pipe(
                    takeUntil(s.onSpellEndCast.of(caster)),
                    map(() => e.abilityId),
                ),
            ),
        )
        .subscribe((v) => values.push(v));
    s.natives.currentSpell = spell(caster);
    s.natives.emit("spellChannel");
    driver.advance(0.4);
    s.natives.emit("spellEndCast");
    driver.advance(1);
    assert.deepEqual(values, []);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(s.onSpellEndCast.routeCount(), 0);
    s.natives.emit("spellChannel");
    driver.advance(0.8);
    assert.deepEqual(values, [1095262842]);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(s.onSpellEndCast.routeCount(), 0);
    s.natives.emit("spellEndCast");
    assert.deepEqual(values, [1095262842]);
    sub.unsubscribe();
    assert.equal(s.onSpellChannel.routeCount(), 0);
});

test("重複引導以 switchMap 取消舊計時，外層取消清理全部資源", () => {
    const s = setup(),
        driver = new FakeClockDriver(),
        clock = new Clock(driver),
        caster = fakeUnit();
    let calls = 0;
    const sub = s.onSpellChannel
        .of(caster)
        .pipe(
            switchMap(() =>
                timer(0.8, { clock, phase: Phase.Combat }).pipe(
                    takeUntil(s.onSpellEndCast.of(caster)),
                ),
            ),
        )
        .subscribe(() => {
            calls++;
        });
    s.natives.currentSpell = spell(caster);
    s.natives.emit("spellChannel");
    driver.advance(0.5);
    s.natives.emit("spellChannel");
    driver.advance(0.5);
    assert.equal(calls, 0);
    assert.equal(clock.pendingCount(), 1);
    assert.equal(s.onSpellEndCast.routeCount(), 1);
    sub.unsubscribe();
    driver.advance(1);
    assert.equal(calls, 0);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
    assert.equal(s.onSpellEndCast.routeCount(), 0);
    assert.equal(s.onSpellChannel.routeCount(), 0);
});

test("註冊失敗清理 Map 與觸發器，後續訂閱可以重試", () => {
    const s = setup(),
        unit = fakeUnit();
    let errors = 0;
    s.natives.failRegister = true;
    s.onDamaged.ofTarget(unit).subscribe({
        error: () => {
            errors++;
        },
    });
    assert.equal(errors, 1);
    assert.equal(s.onDamaged.routeCount(), 0);
    assert.equal(s.natives.destroys, 1);
    s.natives.failRegister = false;
    const sub = s.onDamaged.ofTarget(unit).subscribe();
    assert.equal(s.natives.creates, 2);
    sub.unsubscribe();
    assert.equal(s.onDamaged.routeCount(), 0);
});

test("傷害快照是唯讀資料，沒有修改方法", () => {
    const s = setup();
    let saved!: DamageEvent;
    s.onDamaged.subscribe((e) => {
        saved = e;
    });
    s.natives.emit("damaged");
    assert.equal("setAmount" in saved, false);
    assert.equal("setAttackType" in saved, false);
    assert.equal("setDamageType" in saved, false);
    assert.equal("setWeaponType" in saved, false);
});

test("非有限值與超出 int32 範圍的傷害修改均被拒絕", () =>
    withErrors((errors) => {
        const s = setup();
        s.onDamaging.subscribe((e) => {
            e.setAmount(NaN);
            e.setAmount(Infinity);
            e.setAmount(2147483648);
        });
        s.natives.emit("damaging");
        assert.equal(errors.length, 3);
        assert.equal(s.natives.writes, 0);
    }));

test("自訂 Subscriber 的 next 拋出錯誤時其他路由仍可分發", () =>
    withErrors((errors) => {
        class FailingSubscriber extends Subscriber<DamageEvent> {
            public next(): void {
                throw new Error("預期的自訂訂閱者錯誤。");
            }
        }
        const s = setup(),
            unit = fakeUnit();
        let calls = 0;
        s.onDamaged.subscribe(new FailingSubscriber());
        s.onDamaged.ofTarget(unit).subscribe(() => {
            calls++;
        });
        s.natives.emitDamage("damaged", damage(undefined, unit));
        s.natives.emitDamage("damaged", damage(undefined, unit));
        assert.equal(calls, 2);
        assert.equal(errors.length, 2);
    }));

test("訂閱順序接近 int32 上限時重編號，順序仍相同", () => {
    const s = setup(),
        source = fakeUnit(),
        target = fakeUnit(),
        values: string[] = [];
    s.onDamaged.ofTarget(target).subscribe(() => values.push("目標"));
    s.onDamaged.ofSource(source).subscribe(() => values.push("來源"));
    const internal = s.onDamaged as unknown as { sequence: number };
    internal.sequence = 2147483000;
    s.onDamaged.subscribe(() => values.push("全域"));
    assert.equal(internal.sequence, 3);
    s.natives.emitDamage("damaged", damage(source, target));
    assert.deepEqual(values, ["目標", "來源", "全域"]);
});

test("分發期間達到訂閱順序上限時拒絕新增，且不保留空的單位 Map", () =>
    withErrors((errors) => {
        const s = setup(),
            other = fakeUnit();
        let calls = 0;
        s.onDamaged.subscribe(() => {
            (s.onDamaged as unknown as { sequence: number }).sequence = 2147483000;
            s.onDamaged.ofTarget(other).subscribe();
        });
        s.onDamaged.subscribe(() => {
            calls++;
        });
        s.natives.emit("damaged");
        assert.equal(calls, 1);
        assert.equal(errors.length, 1);
        assert.equal(s.onDamaged.routeCount(), 0);
    }));

test("float32 傷害值修改後仍為有限值且在 int32 數值範圍內", () => {
    class Float32Natives extends FakeEventNatives {
        public setDamageAmount(value: number): void {
            super.setDamageAmount(Math.fround(value));
        }
    }
    const natives = new Float32Natives(),
        s = createWc3Events(natives);
    const amounts: number[] = [];
    s.onDamaging.subscribe((e) => e.setAmount(Math.fround(e.amount / 2)));
    s.onDamaging.subscribe((e) => amounts.push(e.amount));
    for (const amount of [Math.fround(0.1), Math.fround(12345.67), 2147482880]) {
        natives.currentDamage = damage(undefined, undefined, amount);
        natives.emit("damaging");
        assert.equal(amounts[amounts.length - 1], Math.fround(amount / 2));
        assert.equal(natives.currentDamage.amount, Math.fround(amount / 2));
        assert.ok(Math.abs(natives.currentDamage.amount) <= 2147483647);
    }
});

test("WC3 原生介面使用正確事件常數、原生參數及全部玩家聊天註冊", () => {
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const replace = (name: string, value: unknown) => {
        saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    };
    const natives = wc3EventNatives;
    const registrations: unknown[] = [],
        chatIds: number[] = [];
    const trigger = {} as ReturnType<typeof natives.createTrigger>;
    const cases = [
        ["damaging", "EVENT_PLAYER_UNIT_DAMAGING"],
        ["damaged", "EVENT_PLAYER_UNIT_DAMAGED"],
        ["spellChannel", "EVENT_PLAYER_UNIT_SPELL_CHANNEL"],
        ["spellCast", "EVENT_PLAYER_UNIT_SPELL_CAST"],
        ["spellEffect", "EVENT_PLAYER_UNIT_SPELL_EFFECT"],
        ["spellFinish", "EVENT_PLAYER_UNIT_SPELL_FINISH"],
        ["spellEndCast", "EVENT_PLAYER_UNIT_SPELL_ENDCAST"],
        ["death", "EVENT_PLAYER_UNIT_DEATH"],
    ] as const;
    try {
        for (const [, constant] of cases) replace(constant, constant);
        replace("TriggerRegisterAnyUnitEventBJ", (actual: unknown, event: unknown) => {
            assert.equal(actual, trigger);
            registrations.push(event);
        });
        replace("bj_MAX_PLAYER_SLOTS", 24);
        replace("Player", (id: number) => id);
        replace(
            "TriggerRegisterPlayerChatEvent",
            (actual: unknown, player: number, message: string, exact: boolean) => {
                assert.equal(actual, trigger);
                assert.equal(message, "");
                assert.equal(exact, false);
                chatIds.push(player);
            },
        );
        for (const [kind] of cases) natives.registerUnitEvent(trigger, kind);
        natives.registerChat(trigger);
        assert.deepEqual(
            registrations,
            cases.map(([, constant]) => constant),
        );
        assert.deepEqual(
            chatIds,
            Array.from({ length: 24 }, (_, id) => id),
        );
        const raw = fakeUnit();
        assert.equal(natives.unwrapUnit(raw), raw);
        assert.equal(natives.unwrapUnit({ handle: raw }), raw);
    } finally {
        for (const [name, descriptor] of saved) {
            if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
            else Object.defineProperty(globalThis, name, descriptor);
        }
    }
});
