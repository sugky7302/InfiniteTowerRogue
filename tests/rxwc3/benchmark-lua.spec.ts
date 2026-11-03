import { Measurement } from "../../src/shared/rxwc3/benchmark/measurement";
import { probe } from "../../src/shared/rxwc3/benchmark/metrics";
import {
    formatRecord,
    parseRecords,
    resultPages,
    resultValue,
} from "../../src/shared/rxwc3/benchmark/results";
import { cases, createWorkload } from "../../src/shared/rxwc3/benchmark/workloads";

/** 使用公開 API 與假的 EventHub 原生介面。Node 與 Lua 執行同一組工作。 */
export function verifyBenchmark(): number {
    let groups = 0;
    for (const spec of cases) {
        const native = createWorkload(spec, "native");
        const rx = createWorkload(spec, "rx");
        for (let index = 0; index < 40; index++) {
            native.step();
            rx.step();
            if (native.checksum() !== rx.checksum()) throw new Error("基準對照組的工作不同。");
        }
        native.dispose();
        rx.dispose();
        groups++;
    }
    const absent = probe({
        clock: () => {
            throw new Error("預期的時鐘錯誤。");
        },
        memory: () => {
            throw new Error("預期的記憶體錯誤。");
        },
    });
    let count = 0;
    const measurement = new Measurement(
        {
            step: () => {
                count++;
            },
            checksum: () => count,
            dispose: () => {},
        },
        {},
        absent,
    );
    measurement.runBatch(40);
    measurement.runBatch(15);
    if (
        count !== 40 ||
        measurement.microseconds !== undefined ||
        measurement.allocationKb !== undefined
    )
        throw new Error("間接量測沒有繼續執行。");
    groups++;
    const pages = resultPages([
        formatRecord({ id: "B1", cpu_ms: resultValue(undefined), operations: count }),
    ]);
    const rows = parseRecords(pages[0]);
    if (rows[1].cpu_ms !== "na" || rows[1].operations !== "40")
        throw new Error("Lua 結果格式錯誤。");
    groups++;
    return groups;
}
