import { strict as assert } from "node:assert";
import { test } from "node:test";
import { encodeFileData, MAX_FILE_DATA_LENGTH } from "../../src/shared/lib/file-io";
import { Subscription } from "../../src/shared/lib/rxwc3";
import { Measurement } from "../../src/shared/lib/rxwc3/benchmark/measurement";
import {
    dispatchGoal,
    elapsedUs,
    median,
    observationalGoal,
    probe,
    ratio,
    resolvedMs,
    timerGoal,
} from "../../src/shared/lib/rxwc3/benchmark/metrics";
import {
    formatRecord,
    parseRecords,
    resultPages,
    resultValue,
} from "../../src/shared/lib/rxwc3/benchmark/results";
import { Output } from "../../src/shared/lib/rxwc3/benchmark/wc3/runtime";
import { runTimers } from "../../src/shared/lib/rxwc3/benchmark/wc3/timers";
import { verifyBenchmark } from "./benchmark-lua.spec";
import { int32, Wc3TimerModel } from "./wc3-timer-model";

test("基準在 Node 執行十一組 Lua 共用驗證", () => {
    assert.equal(verifyBenchmark(), 11);
});

test("中位數支援空值、奇數及偶數，且不修改輸入", () => {
    const values = [9, 1, 3];
    assert.equal(median(values), 3);
    assert.deepEqual(values, [9, 1, 3]);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), undefined);
});

test("結果保留零、布林值與缺少值，並可解析多筆記錄", () => {
    const text = formatRecord({ id: "B1", value: 0, valid: false, cpu_ms: resultValue(undefined) });
    assert.deepEqual(parseRecords(text + ";" + formatRecord({ id: "G1", status: "unknown" })), [
        { id: "B1", value: "0", valid: "false", cpu_ms: "na" },
        { id: "G1", status: "unknown" },
    ]);
    assert.deepEqual(parseRecords(""), []);
});

test("結果拒絕分隔符號、重複欄位與不可寫入的文字", () => {
    for (const value of ["中文", "a;b", "a=b", "a,b", "a\nb", 'a"b', "a\\b", ""])
        assert.throws(() => formatRecord({ value }));
    for (const value of ["=a", "a=b,a=c", "a", "a=b;", "a=b=c"])
        assert.throws(() => parseRecords(value));
});

test("結果分檔保持記錄完整，全部頁面都可通過 file-io 上限", () => {
    const records = Array.from({ length: 100 }, (_, id) =>
        formatRecord({ id, data: "a".repeat(150) }),
    );
    const pages = resultPages(records);
    assert.ok(pages.length > 1);
    const restored: string[] = [];
    pages.forEach((page, index) => {
        assert.ok(page.length <= MAX_FILE_DATA_LENGTH);
        assert.ok(encodeFileData(page));
        const rows = parseRecords(page);
        assert.equal(rows[0].page, `${index + 1}`);
        assert.equal(rows[0].pages, `${pages.length}`);
        restored.push(...rows.slice(1).map(formatRecord));
    });
    assert.deepEqual(restored, records);
    assert.throws(() => resultPages(["a".repeat(MAX_FILE_DATA_LENGTH)]));
});

test("探測使用最小正差值，並分別驗證記憶體與回收能力", () => {
    let tick = 0;
    let collections = 0;
    let restarts = 0;
    const result = probe({
        clock: () => Math.fround(++tick / 1000),
        memory: () => 123,
        collect: () => {
            collections++;
        },
        stopGc: () => {},
        restartGc: () => {
            restarts++;
        },
    });
    assert.equal(result.timed, true);
    assert.ok(result.resolution! > 0 && result.resolution! < 0.0011);
    assert.equal(result.memory, true);
    assert.equal(result.collect, true);
    assert.equal(result.pauseGc, true);
    assert.equal(collections, 1);
    assert.equal(restarts, 1);
});

test("探測缺少、拋錯、停止與倒退時鐘時使用間接指標", () => {
    for (const functions of [
        {},
        { clock: () => 1 },
        { clock: () => NaN },
        {
            clock: () => {
                throw new Error("預期錯誤。");
            },
        },
    ]) {
        assert.equal(probe(functions).timed, false);
    }
    let value = 2;
    assert.equal(probe({ clock: () => value-- }).clock, false);
    assert.equal(
        probe({
            memory: () => {
                throw new Error("預期錯誤。");
            },
        }).memory,
        false,
    );
    const failed = probe({
        memory: () => 1,
        collect: () => {
            throw new Error("預期錯誤。");
        },
    });
    assert.equal(failed.memory, true);
    assert.equal(failed.collect, false);
    assert.equal(failed.pauseGc, false);
});

test("G1 嚴格小於門檻，G4 同時檢查順序、數量與兩個計時器", () => {
    assert.equal(dispatchGoal(0.049), "pass");
    assert.equal(dispatchGoal(0.05), "fail");
    assert.equal(dispatchGoal(), "unknown");
    assert.equal(timerGoal(true, 500, 2), "pass");
    for (const result of [
        timerGoal(false, 500, 2),
        timerGoal(true, 499, 2),
        timerGoal(true, 500, 3),
    ])
        assert.equal(result, "fail");
    assert.equal(observationalGoal(), "unknown");
    assert.equal(ratio(2, 1), 2);
    assert.equal(ratio(2, 0), undefined);
    assert.equal(ratio(), undefined);
    assert.equal(resolvedMs(0, 0.001), undefined);
    assert.equal(resolvedMs(4000, 0.001), undefined);
    assert.equal(resolvedMs(5000, 0.001), 5);
});

test("分批量測排除回呼間的等待，累計整數成本，並記錄配置量", () => {
    let cpu = 0;
    let memory = 100;
    let paused = false;
    let collections = 0;
    const functions = {
        clock: () => Math.fround(cpu),
        memory: () => memory,
        collect: () => {
            collections++;
        },
        stopGc: () => {
            paused = true;
        },
        restartGc: () => {
            paused = false;
        },
    };
    const capabilities = {
        clock: true,
        timed: true,
        resolution: 0.000001,
        memory: true,
        collect: true,
        pauseGc: true,
    };
    const m = new Measurement(
        {
            step: () => {
                assert.ok(paused);
                cpu = Math.fround(cpu + 0.0001);
                memory += 0.25;
            },
            checksum: () => 0,
            dispose: () => {},
        },
        functions,
        capabilities,
    );
    m.runBatch(50);
    cpu += 30;
    m.runBatch(25);
    assert.equal(m.completed, 50);
    assert.equal(m.batches, 2);
    assert.equal(collections, 1);
    assert.equal(paused, false);
    assert.ok(m.microseconds! > 4900 && m.microseconds! < 5100);
    int32(m.microseconds!);
    assert.equal(m.allocationKb, 12.5);
    assert.equal(elapsedUs(2, 1), undefined);
    assert.equal(elapsedUs(0, 3000), undefined);
});

test("量測期間的探測失敗不會停止工作，也不會產生假的零成本", () => {
    const m = new Measurement(
        { step: () => {}, checksum: () => 0, dispose: () => {} },
        {
            clock: () => {
                throw new Error("預期錯誤。");
            },
            memory: () => 1,
        },
        { clock: true, timed: true, resolution: 1, memory: true, collect: false, pauseGc: false },
    );
    m.runBatch(2);
    assert.equal(m.completed, 2);
    assert.equal(m.microseconds, undefined);
    assert.equal(m.allocationKb, undefined);
});

test("工作拋錯時仍恢復垃圾回收", () => {
    let restarted = false;
    const m = new Measurement(
        {
            step: () => {
                throw new Error("預期錯誤。");
            },
            checksum: () => 0,
            dispose: () => {},
        },
        {
            memory: () => 1,
            stopGc: () => {},
            restartGc: () => {
                restarted = true;
            },
        },
        {
            clock: false,
            timed: false,
            memory: true,
            collect: false,
            pauseGc: true,
            resolution: undefined,
        },
    );
    assert.throws(() => m.runBatch(1));
    assert.equal(restarted, true);
});

test("B4 在 float32 原生計時器中完成全部波次，順序正確且 RxWC3 使用兩個計時器", () => {
    const model = new Wc3TimerModel();
    const owner = new Subscription();
    const records: string[] = [];
    const savedLog = console.log;
    console.log = () => {};
    const output = {
        functions: {},
        capabilities: probe({}),
        row: formatRecord,
    } as unknown as Output;
    let done = false;
    try {
        runTimers(output, owner, records, () => {
            done = true;
            owner.unsubscribe();
        });
        model.advance(120);
        assert.equal(done, true);
        const rows = records.map((row) => parseRecords(row)[0]);
        const rx = rows.filter((row) => row.type === "round" && row.mode === "rx");
        assert.equal(rx.length, 10);
        for (const row of rx) {
            assert.equal(row.completed, "500");
            assert.equal(row.pending_peak, "500");
            assert.equal(row.ordered, "true");
            assert.equal(row.timers, "2");
            assert.equal(row.status, "pass");
        }
        assert.equal(model.timerCount(), 1);
    } finally {
        owner.unsubscribe();
        model.restore();
        console.log = savedLog;
    }
});

test("B4 在建立中停止時釋放全部基準計時器", () => {
    const model = new Wc3TimerModel();
    const owner = new Subscription();
    const savedLog = console.log;
    console.log = () => {};
    try {
        runTimers(
            { functions: {}, capabilities: probe({}), row: formatRecord } as unknown as Output,
            owner,
            [],
            () => assert.fail("停止後不應完成。"),
        );
        model.advance(0.01);
        owner.unsubscribe();
        model.advance(10);
        assert.equal(model.timerCount(), 1);
    } finally {
        owner.unsubscribe();
        model.restore();
        console.log = savedLog;
    }
});
