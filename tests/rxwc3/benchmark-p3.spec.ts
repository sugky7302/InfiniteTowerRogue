import * as assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { verifyBenchmarkP3 } from "./benchmark-p3-lua.spec";
import { encodeFileData } from "../../src/shared/file-io/codec";
import { resultPages } from "../../src/shared/rxwc3/benchmark/results";
import { Measurement } from "../../src/shared/rxwc3/benchmark/measurement";
import { Subscriber, config } from "../../src/shared/rxwc3";
import { isLocalExecution } from "../../src/shared/rxwc3/sync/execution";

const { decodeBenchmark, decodePld } = require("../../scripts/decode-bench.cjs");
const { options, run } = require("../../scripts/run-bench.cjs");

function pld(value: string): string {
    const encoded = encodeFileData(value)!;
    const parts: string[] = [];
    for (let index = 0; index < encoded.length; index += 96)
        parts.push(
            `call BlzSetAbilityTooltip('A0IO',${index === 0 ? "" : "BlzGetAbilityTooltip('A0IO',0)+"}"${encoded.slice(index, index + 96)}",0)`,
        );
    return parts.join("\n");
}

test("P3 的 Node 與 Lua 共用流程通過七組檢查", () => {
    assert.equal(verifyBenchmarkP3(), 7);
});

test("Subscriber 保留回呼參數數量，且本地回呼拋錯後恢復執行狀態", () => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => errors.push(error);
    try {
        const next = new Subscriber<number>({
            next: (...args) => {
                assert.deepEqual(args, [3]);
                throw "本地錯誤";
            },
        });
        next.localContext = true;
        next.next(3);
        assert.deepEqual(errors, ["本地錯誤"]);
        assert.equal(isLocalExecution(), false);
        let completeArgs = -1;
        new Subscriber({
            complete: (...args) => {
                completeArgs = args.length;
            },
        }).complete();
        assert.equal(completeArgs, 0);
        let errorArgs: unknown[] = [];
        new Subscriber({
            error: (...args) => {
                errorArgs = args;
            },
        }).error(undefined);
        assert.deepEqual(errorArgs, [undefined]);
    } finally {
        config.onUnhandledError = saved;
    }
});

test("批次達到 5 ms 後縮小工作量，等待時間不納入成本", () => {
    let cpu = 0;
    const measurement = new Measurement(
        {
            step: () => {
                cpu += 0.00025;
            },
            checksum: () => 0,
            dispose: () => {},
        },
        { clock: () => Math.fround(cpu) },
        {
            clock: true,
            timed: true,
            resolution: 0.001,
            memory: false,
            collect: false,
            pauseGc: false,
        },
    );
    measurement.runBatch(100);
    cpu += 30;
    measurement.runBatch(100);
    assert.equal(measurement.completed, 37);
    assert.ok(Math.abs(measurement.microseconds! - 9250) <= 2);
});

test("解碼依頁數讀取，驗證框架，忽略舊尾檔", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "rxwc3-decode-"));
    try {
        const records = Array.from(
            { length: 160 },
            (_, index) => `type=sample,index=${index},value=1234567890`,
        );
        const pages = resultPages(records);
        pages.forEach((data, index) =>
            writeFileSync(
                path.join(directory, `bench-p1${index === 0 ? "" : `-${index + 1}`}.pld`),
                pld(data),
            ),
        );
        writeFileSync(path.join(directory, `bench-p1-${pages.length + 1}.pld`), "舊檔");
        const lines = decodeBenchmark(directory, "bench-p1");
        assert.equal(
            lines.filter((line: string) => line.startsWith("type=sample")).length,
            records.length,
        );
        const first = path.join(directory, "bench-p1.pld");
        writeFileSync(first, readFileSync(first, "utf8").replace("value=123", "value=999"));
        assert.throws(() => decodePld(first), /檢查碼/);
        assert.throws(() => decodeBenchmark(directory, "../bench-p1"), /前綴/);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("自動工具拒絕無效指令、路徑標籤與等待秒數", () => {
    assert.throws(() => options(["-bench-stop", "p3"]), /指令/);
    assert.throws(() => options(["-bench", "../p3"]), /標籤/);
    assert.throws(() => options(["-bench", "p3"], { BENCH_TIMEOUT_SECONDS: "0" }), /秒數/);
});

test("自動工具建置一次，只關閉自身程序，保存並解碼新結果", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "rxwc3-auto-"));
    const data = path.join(directory, "data");
    const output = path.join(directory, "output");
    mkdirSync(data);
    writeFileSync(path.join(data, "bench-old.pld"), "舊結果");
    writeFileSync(path.join(data, "other.pld"), "其他檔案");
    let launches = 0;
    const game = { exited: false };
    let stopped: unknown;
    const settings = {
        command: "-bench",
        output,
        directory: data,
        timeout: 1,
        config: {
            gameExecutable: "遊戲",
            winePath: process.platform === "win32" ? undefined : "wine",
            outputFolder: "dist/bin",
            mapFolder: "map.w3x",
        },
    };
    try {
        await run(settings, {
            launch: (_executable: string, args: string[], env: NodeJS.ProcessEnv) => {
                launches++;
                if (launches === 1) {
                    assert.equal(env.BENCH_AUTO, "-bench");
                    assert.ok(args.includes("scripts/build.ts"));
                    return { code: 0, done: Promise.resolve() };
                }
                assert.ok(args.includes("-loadfile"));
                assert.ok(!args.includes("-editor"));
                assert.equal(existsSync(path.join(data, "bench-old.pld")), false);
                writeFileSync(
                    path.join(data, "bench-p1.pld"),
                    pld(resultPages(["type=end,completed=true"])[0]),
                );
                writeFileSync(path.join(data, "bench-auto-done.pld"), pld("done"));
                return game;
            },
            stop: async (state: unknown) => {
                stopped = state;
            },
            delay: async () => {},
        });
        assert.equal(launches, 2);
        assert.equal(stopped, game);
        assert.equal(readFileSync(path.join(data, "other.pld"), "utf8"), "其他檔案");
        assert.match(readFileSync(path.join(output, "bench-p1.txt"), "utf8"), /completed=true/);
        assert.equal(JSON.parse(readFileSync(path.join(output, "run.json"), "utf8")).error, null);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
