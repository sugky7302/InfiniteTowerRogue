import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FileReadStatus } from "../../src/shared/lib/file-io";
import { Subscription } from "../../src/shared/lib/rxwc3";
import { probe } from "../../src/shared/lib/rxwc3/benchmark/metrics";
import {
    formatRecord,
    parseRecords,
    resultPages,
} from "../../src/shared/lib/rxwc3/benchmark/results";
import { Output } from "../../src/shared/lib/rxwc3/benchmark/wc3/runtime";
import { runStress } from "../../src/shared/lib/rxwc3/benchmark/wc3/stress";
import { Mode } from "../../src/shared/lib/rxwc3/benchmark/workloads";

interface FakeTrigger {
    action?: () => void;
    kind?: number;
    destroyed: boolean;
}
interface FakeUnit {
    removed: boolean;
}

/** 每秒產生一次命中。只驗證計數、分檔、比較與清理，不模擬遊戲效能。 */
function stressFixture(timed = true) {
    const descriptors = new Map<string, PropertyDescriptor | undefined>();
    const replace = (name: string, value: unknown) => {
        descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    };
    const units: FakeUnit[] = [];
    const triggers: FakeTrigger[] = [];
    const files = new Map<string, string>();
    const timers: { callback?: () => void; destroyed: boolean }[] = [];
    const alliances = new Map<string, boolean>();
    let amount = 20;
    let cpu = 0;
    let paused = false;
    for (const [name, value] of Object.entries({
        bj_PLAYER_NEUTRAL_EXTRA: 26,
        PLAYER_NEUTRAL_AGGRESSIVE: 24,
        ALLIANCE_PASSIVE: 0,
        EVENT_PLAYER_UNIT_DAMAGING: 1,
        EVENT_PLAYER_UNIT_DAMAGED: 2,
        Player: (id: number) => id,
        GetPlayerAlliance: (a: number, b: number) => alliances.get(`${a}-${b}`) ?? false,
        SetPlayerAlliance: (a: number, b: number, _kind: unknown, value: boolean) =>
            alliances.set(`${a}-${b}`, value),
        CreateUnit: () => {
            const unit = { removed: false };
            units.push(unit);
            return unit;
        },
        RemoveUnit: (unit: FakeUnit) => {
            unit.removed = true;
        },
        FourCC: () => 1,
        SetUnitPathing: () => {},
        SetUnitCreepGuard: () => {},
        RemoveGuardPosition: () => {},
        BlzSetUnitMaxHP: () => {},
        SetWidgetLife: () => {},
        BlzSetUnitAttackCooldown: () => {},
        IssueTargetOrder: () => true,
        CreateTrigger: () => {
            const trigger = { destroyed: false };
            triggers.push(trigger);
            return trigger;
        },
        TriggerAddAction: (trigger: FakeTrigger, action: () => void) => {
            trigger.action = action;
        },
        TriggerRegisterAnyUnitEventBJ: (trigger: FakeTrigger, kind: number) => {
            trigger.kind = kind;
        },
        DestroyTrigger: (trigger: FakeTrigger) => {
            assert.equal(trigger.destroyed, false);
            trigger.destroyed = true;
        },
        GetTriggerUnit: () => units[units.length - 1],
        GetEventDamageSource: () => units[units.length - 2],
        GetEventDamage: () => amount,
        BlzSetEventDamage: (value: number) => {
            amount = value;
        },
        BlzGetEventAttackType: () => 1,
        BlzGetEventDamageType: () => 1,
        BlzGetEventWeaponType: () => 1,
        BlzGetEventIsAttack: () => true,
        CreateTimer: () => {
            const timer = { destroyed: false };
            timers.push(timer);
            return timer;
        },
        TimerStart: (
            timer: { callback?: () => void },
            _seconds: number,
            periodic: boolean,
            callback: () => void,
        ) => {
            assert.equal(periodic, true);
            timer.callback = callback;
        },
        PauseTimer: () => {},
        DestroyTimer: (timer: { destroyed: boolean }) => {
            timer.destroyed = true;
        },
    }))
        replace(name, value);
    const functions = timed
        ? {
              clock: () => {
                  cpu = Math.fround(cpu + 0.00001);
                  return cpu;
              },
              memory: () => 100,
              collect: () => {},
              stopGc: () => {
                  paused = true;
              },
              restartGc: () => {
                  paused = false;
              },
          }
        : {};
    const output = {
        functions,
        capabilities: probe(functions),
        metadata: () => formatRecord({ type: "probe", fixture: 1 }),
        row: formatRecord,
        write: (name: string, records: string[]) => {
            resultPages(records).forEach((page, index) =>
                files.set(`${name}${index === 0 ? "" : "-" + (index + 1)}`, page),
            );
        },
        files: {
            read: (path: string) => {
                const data = files.get(path.slice("InfiniteTowerRogue\\".length, -4));
                return data === undefined
                    ? { status: FileReadStatus.Missing }
                    : { status: FileReadStatus.Read, data };
            },
        },
    } as unknown as Output;
    return {
        units,
        triggers,
        files,
        timers,
        output,
        advance: (seconds: number) => {
            const pulse = timers[timers.length - 1];
            for (let index = 0; index < seconds && !pulse.destroyed; index++) {
                amount = 20;
                for (const kind of [1, 2])
                    for (const trigger of triggers)
                        if (!trigger.destroyed && trigger.kind === kind) trigger.action!();
                assert.equal(amount, 10);
                assert.equal(paused, false);
                pulse.callback!();
            }
        },
        restore: () => {
            for (const [name, descriptor] of descriptors)
                if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
                else Object.defineProperty(globalThis, name, descriptor);
        },
        allianceValues: () => [...alliances.values()],
    };
}

for (const mode of ["native", "rx"] as const) {
    test(`B5 ${mode} 暖身後記錄 30 秒，停止時清理 200 個單位與兩個傷害觸發器`, () => {
        const fixture = stressFixture();
        const owner = new Subscription();
        const saved = console.log;
        console.log = () => {};
        try {
            runStress(fixture.output, owner, mode, false);
            fixture.advance(35);
            assert.equal(owner.closed, true);
            assert.equal(fixture.units.length, 200);
            assert.ok(fixture.units.every((unit) => unit.removed));
            assert.ok(fixture.triggers.every((trigger) => trigger.destroyed));
            assert.ok(fixture.allianceValues().every((value) => value === false));
            const rows = parseRecords(fixture.files.get(`bench-stress-${mode}`)!);
            const summary = rows.find((row) => row.type === "summary")!;
            assert.equal(summary.seconds, "30");
            assert.equal(summary.hits, "30");
            assert.equal(summary.events, "60");
            assert.equal(summary.completed, "true");
            assert.equal(summary.comparison, "missing_pair");
            const seconds = parseRecords(fixture.files.get(`bench-stress-${mode}-s1`)!).filter(
                (row) => row.type === "second",
            );
            assert.equal(seconds.length, 30);
            assert.equal(seconds[0].damaging, "1");
            assert.equal(seconds[0].damaged, "1");
        } finally {
            owner.unsubscribe();
            fixture.restore();
            console.log = saved;
        }
    });
}

test("B6 的 300 秒輸出有十一筆記憶體樣本與十個區段，兩組可依結果檔比較", () => {
    const fixture = stressFixture();
    const saved = console.log;
    console.log = () => {};
    const owners: Subscription[] = [];
    try {
        for (const mode of ["native", "rx"] as Mode[]) {
            const owner = new Subscription();
            owners.push(owner);
            runStress(fixture.output, owner, mode, true);
            fixture.advance(305);
            assert.ok(owner.closed);
        }
        const rows = parseRecords(fixture.files.get("bench-soak-rx")!);
        const memory = Array.from(
            { length: 11 },
            (_, index) => parseRecords(fixture.files.get(`bench-soak-rx-m${index}`)!)[1],
        );
        assert.equal(memory.length, 11);
        assert.equal(memory[0].second, "0");
        assert.equal(memory[10].second, "300");
        const config = rows.find((row) => row.type === "config")!;
        assert.equal(config.segments, "10");
        const summary = rows.find((row) => row.type === "summary")!;
        assert.equal(summary.comparison, "separate_run");
        assert.ok(Number(summary.ratio) > 0);
        assert.ok(fixture.units.every((unit) => unit.removed));
        assert.ok(fixture.timers.every((timer) => timer.destroyed));
    } finally {
        for (const owner of owners) owner.unsubscribe();
        fixture.restore();
        console.log = saved;
    }
});

test("B5 沒有時鐘與記憶體時仍輸出全部事件，並保持目標無法判定", () => {
    const fixture = stressFixture(false);
    const owner = new Subscription();
    const saved = console.log;
    console.log = () => {};
    try {
        runStress(fixture.output, owner, "rx", false);
        fixture.advance(35);
        const rows = parseRecords(fixture.files.get("bench-stress-rx")!);
        const summary = rows.find((row) => row.type === "summary")!;
        assert.equal(summary.events, "60");
        assert.equal(summary.cpu_ms, "na");
        assert.equal(summary.ratio, "na");
        assert.ok(
            rows.filter((row) => row.type === "goal").every((row) => row.status === "unknown"),
        );
    } finally {
        owner.unsubscribe();
        fixture.restore();
        console.log = saved;
    }
});

test("B5 在暖身期間停止時仍保存未完成標記並清理資源", () => {
    const fixture = stressFixture();
    const owner = new Subscription();
    const saved = console.log;
    console.log = () => {};
    try {
        runStress(fixture.output, owner, "native", false);
        fixture.advance(3);
        owner.unsubscribe();
        const rows = parseRecords(fixture.files.get("bench-stress-native")!);
        assert.equal(rows.find((row) => row.type === "summary")!.completed, "false");
        assert.ok(fixture.units.every((unit) => unit.removed));
        assert.ok(fixture.triggers.every((trigger) => trigger.destroyed));
    } finally {
        owner.unsubscribe();
        fixture.restore();
        console.log = saved;
    }
});

test("B5 沒有量測介面且在暖身停止時，不輸出假的零成本", () => {
    const fixture = stressFixture(false);
    const owner = new Subscription();
    const saved = console.log;
    console.log = () => {};
    try {
        runStress(fixture.output, owner, "rx", false);
        fixture.advance(1);
        owner.unsubscribe();
        const rows = parseRecords(fixture.files.get("bench-stress-rx")!);
        const summary = rows.find((row) => row.type === "summary")!;
        assert.equal(summary.completed, "false");
        assert.equal(summary.cpu_ms, "na");
        assert.equal(summary.alloc_kb_event, "na");
    } finally {
        owner.unsubscribe();
        fixture.restore();
        console.log = saved;
    }
});
