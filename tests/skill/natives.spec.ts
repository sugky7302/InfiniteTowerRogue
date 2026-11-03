import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWc3SkillNatives } from "../../src/shared/wc3-def/wc3-skill-natives";
import { wc3FrameNatives } from "../../src/shared/wc3-def/wc3-frame-natives";

function withGlobals(values: Record<string, unknown>, run: () => void): void {
    const scope = globalThis as unknown as Record<string, unknown>;
    const saved = Object.keys(values).map(
        (key) => [key, Object.getOwnPropertyDescriptor(scope, key)] as const,
    );
    for (const [key, value] of Object.entries(values))
        Object.defineProperty(scope, key, { value, writable: true, configurable: true });
    try {
        run();
    } finally {
        for (const [key, descriptor] of saved) {
            if (descriptor) Object.defineProperty(scope, key, descriptor);
            else delete scope[key];
        }
    }
}
test("S0 正式幀介面使用週期原生計時器並完整銷毀", () => {
    const handle = {} as timer;
    const calls: string[] = [];
    let action: (() => void) | undefined;
    withGlobals(
        {
            CreateTimer: () => {
                calls.push("建立");
                return handle;
            },
            TimerStart: (
                target: timer,
                seconds: number,
                periodic: boolean,
                callback: () => void,
            ) => {
                assert.equal(target, handle);
                assert.equal(seconds, 1 / 32);
                assert.equal(periodic, true);
                action = callback;
            },
            PauseTimer: (target: timer) => {
                assert.equal(target, handle);
                calls.push("停止");
            },
            DestroyTimer: () => calls.push("銷毀"),
        },
        () => {
            let count = 0;
            const stop = wc3FrameNatives.start(1 / 32, () => {
                count++;
            });
            action!();
            assert.equal(count, 1);
            stop();
            assert.deepEqual(calls, ["建立", "停止", "銷毀"]);
        },
    );
});
test("S2 正式介面預建群組與傷害觸發器，傷害後修正只限自身事件", () => {
    const source = {} as unit,
        target = {} as unit,
        other = {} as unit;
    const queue: unit[] = [],
        calls: unknown[][] = [];
    let action: (() => void) | undefined,
        currentSource = source,
        currentTarget = target;
    let creates = 0,
        writes = 0,
        amount = 0;
    withGlobals(
        {
            CreateGroup: () => {
                creates++;
                return {};
            },
            DestroyGroup: () => calls.push(["銷毀群組"]),
            CreateTrigger: () => {
                creates++;
                return {};
            },
            DestroyTrigger: () => calls.push(["銷毀觸發器"]),
            EVENT_PLAYER_UNIT_DAMAGED: 1,
            TriggerRegisterAnyUnitEventBJ: (_t: trigger, event: number) => assert.equal(event, 1),
            TriggerAddAction: (_t: trigger, callback: () => void) => {
                action = callback;
            },
            GetEventDamageSource: () => currentSource,
            GetTriggerUnit: () => currentTarget,
            BlzSetEventDamage: (value: number) => {
                writes++;
                amount = value;
            },
            ATTACK_TYPE_NORMAL: 2,
            DAMAGE_TYPE_UNIVERSAL: 3,
            WEAPON_TYPE_WHOKNOWS: 4,
            UnitDamageTarget: (...args: unknown[]) => {
                calls.push(args);
                amount = 10;
                currentSource = other;
                action!();
                assert.equal(writes, 0);
                currentSource = source;
                action!();
                action!();
            },
            GroupEnumUnitsInRange: (
                _g: group,
                x: number,
                y: number,
                radius: number,
                filter: unknown,
            ) => {
                assert.deepEqual([x, y, radius, filter], [0, 0, 96, undefined]);
                queue.push(source, target);
            },
            FirstOfGroup: () => queue[0],
            GroupRemoveUnit: () => queue.shift(),
        },
        () => {
            const adapter = createWc3SkillNatives();
            assert.equal(creates, 2);
            const visited: unit[] = [];
            adapter.natives.area(0, 0, 96, (value) => visited.push(value));
            adapter.natives.area(0, 0, 96, () => {});
            assert.equal(creates, 2);
            assert.deepEqual(visited, [source, target]);
            adapter.natives.damage(source, target, 38.214285714);
            assert.equal(amount, 38.214285714);
            assert.equal(writes, 1);
            assert.deepEqual(calls[0], [source, target, 38.214285714, false, false, 2, 3, 4]);
            currentTarget = other;
            action!();
            assert.equal(writes, 1);
            adapter.destroy();
            assert.deepEqual(calls.slice(1), [["銷毀觸發器"], ["銷毀群組"]]);
        },
    );
});
test("S2 目標死亡與移除均視為失效，骰值使用同步原生函式", () => {
    let id = 1,
        life = 100,
        dead = false;
    withGlobals(
        {
            CreateGroup: () => ({}),
            CreateTrigger: () => ({}),
            DestroyGroup: () => {},
            DestroyTrigger: () => {},
            TriggerRegisterAnyUnitEventBJ: () => {},
            TriggerAddAction: () => {},
            EVENT_PLAYER_UNIT_DAMAGED: 1,
            UNIT_TYPE_DEAD: 2,
            GetUnitTypeId: () => id,
            GetWidgetLife: () => life,
            IsUnitType: () => dead,
            GetRandomInt: (low: number, high: number) => {
                assert.deepEqual([low, high], [1, 20]);
                return 13;
            },
        },
        () => {
            const adapter = createWc3SkillNatives(),
                target = {} as unit;
            assert.equal(adapter.natives.alive(target), true);
            id = 0;
            assert.equal(adapter.natives.alive(target), false);
            id = 1;
            life = 0;
            assert.equal(adapter.natives.alive(target), false);
            life = 100;
            dead = true;
            assert.equal(adapter.natives.alive(target), false);
            assert.equal(adapter.natives.randomInt(1, 20), 13);
            adapter.destroy();
        },
    );
});

test("S3 命令原生註冊三種事件，快照保留目標與座標", () => {
    const { wc3EventNatives } = require("../../src/shared/wc3-def/wc3-natives");
    const target = {} as widget,
        ordered = {} as unit,
        trigger = {} as trigger;
    const registered: number[] = [];
    let current = 38;
    withGlobals(
        {
            EVENT_PLAYER_UNIT_ISSUED_ORDER: 38,
            EVENT_PLAYER_UNIT_ISSUED_POINT_ORDER: 39,
            EVENT_PLAYER_UNIT_ISSUED_TARGET_ORDER: 40,
            EVENT_PLAYER_UNIT_ISSUED_UNIT_ORDER: 40,
            TriggerRegisterAnyUnitEventBJ: (value: trigger, event: number) => {
                assert.equal(value, trigger);
                registered.push(event);
            },
            GetTriggerEventId: () => current,
            GetOrderedUnit: () => ordered,
            GetIssuedOrderId: () => 851986,
            GetOrderTarget: () => target,
            GetOrderPointX: () => 123,
            GetOrderPointY: () => 456,
        },
        () => {
            wc3EventNatives.registerUnitEvent(trigger, "order");
            assert.deepEqual(registered, [38, 39, 40]);
            const first = wc3EventNatives.readOrder();
            assert.deepEqual(first, {
                unit: ordered,
                orderId: 851986,
                kind: "immediate",
                target: undefined,
                targetX: 0,
                targetY: 0,
            });
            current = 39;
            const point = wc3EventNatives.readOrder();
            assert.deepEqual([point.kind, point.targetX, point.targetY], ["point", 123, 456]);
            current = 40;
            assert.equal(wc3EventNatives.readOrder().target, target);
            assert.equal(first.kind, "immediate");
            assert.equal(point.kind, "point");
        },
    );
});

test("S3 正式資源介面使用不隱藏停用與停止命令", () => {
    const calls: unknown[][] = [],
        hero = {} as unit;
    withGlobals(
        {
            CreateGroup: () => ({}),
            CreateTrigger: () => ({}),
            DestroyGroup: () => {},
            DestroyTrigger: () => {},
            TriggerRegisterAnyUnitEventBJ: () => {},
            TriggerAddAction: () => {},
            EVENT_PLAYER_UNIT_DAMAGED: 1,
            BlzUnitDisableAbility: (...args: unknown[]) => calls.push(args),
            IssueImmediateOrder: (...args: unknown[]) => calls.push(args),
            BlzEndUnitAbilityCooldown: (...args: unknown[]) => calls.push(args),
            BlzStartUnitAbilityCooldown: (...args: unknown[]) => calls.push(args),
        },
        () => {
            const adapter = createWc3SkillNatives();
            adapter.natives.disableAbility(hero, 1, true);
            adapter.natives.startCooldown(hero, 1, 0);
            adapter.natives.disableAbility(hero, 1, false);
            adapter.natives.startCooldown(hero, 1, 2.75);
            adapter.natives.stop(hero);
            assert.deepEqual(calls, [
                [hero, 1, true, false],
                [hero, 1],
                [hero, 1, false, false],
                [hero, 1, 2.75],
                [hero, "stop"],
            ]);
            adapter.destroy();
        },
    );
});
