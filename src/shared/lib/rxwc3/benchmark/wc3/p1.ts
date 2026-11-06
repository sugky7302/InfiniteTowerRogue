import { resultValue } from "../results";
import { logger } from "../../../logger";
import { Subscription } from "../../index";
import { Measurement } from "../measurement";
import { dispatchGoal, median, observationalGoal, ratio, resolvedMs } from "../metrics";
import { CASES, createWorkload, Mode } from "../workloads";
import { Output, Pump } from "./runtime";
import { runTimers } from "./timers";

const WARMUP = 1000;
const ITERATIONS = 2000;
const ROUNDS = 5;

export function runP1(output: Output, owner: Subscription): void {
    const pump = new Pump(owner);
    const records = [
        output.metadata(),
        output.row({
            type: "config",
            warmup: WARMUP,
            iterations: ITERATIONS,
            rounds: ROUNDS,
            batch_max: 25,
            batch_budget_us: 5000,
            batch_pause_ms: 30,
        }),
    ];
    let finished = false;
    owner.add(() => {
        if (!finished)
            output.write("bench-p1", [...records, output.row({ type: "end", completed: false })]);
    });
    let caseIndex = 0;
    const nextCase = (): void => {
        if (caseIndex === CASES.length) {
            runTimers(output, owner, records, () => {
                records.push(
                    output.row({
                        type: "goal",
                        id: "G2",
                        status: observationalGoal(),
                        reason: "requires_stress_run",
                    }),
                );
                records.push(output.row({ type: "goal", id: "G3", status: observationalGoal() }));
                records.push(output.row({ type: "end", completed: true }));
                output.write("bench-p1", records);
                finished = true;
                owner.unsubscribe();
                logger.info("B1 至 B4 已完成。請保存結果檔；G3 仍須分析，G2 請執行混戰。");
            });
            return;
        }
        const spec = CASES[caseIndex];
        const values: Record<Mode, number[]> = { native: [], rx: [] };
        const memory: Record<Mode, number[]> = { native: [], rx: [] };
        let mode: Mode = "native";
        let round = -1;
        const runRound = (): void => {
            const work = createWorkload(spec, mode);
            const dispose = () => work.dispose();
            owner.add(dispose);
            const measurement = new Measurement(work, output.functions, output.capabilities);
            const target = round < 0 ? WARMUP : ITERATIONS;
            const batch = (): void => {
                measurement.runBatch(target - measurement.completed);
                if (measurement.completed < target) {
                    pump.later(batch);
                    return;
                }
                if (round >= 0) {
                    const resolved = resolvedMs(
                        measurement.microseconds,
                        output.capabilities.resolution,
                    );
                    if (resolved !== undefined) values[mode].push(resolved);
                    if (measurement.allocationKb !== undefined)
                        memory[mode].push(measurement.allocationKb / target);
                    records.push(
                        output.row({
                            type: "round",
                            id: spec.id,
                            mode,
                            round: round + 1,
                            operations: target,
                            cpu_ms: resultValue(
                                measurement.microseconds === undefined
                                    ? undefined
                                    : measurement.microseconds / 1000,
                            ),
                            alloc_kb_op: resultValue(
                                measurement.allocationKb === undefined
                                    ? undefined
                                    : measurement.allocationKb / target,
                            ),
                            net_kb_op: resultValue(
                                measurement.netKb === undefined
                                    ? undefined
                                    : measurement.netKb / target,
                            ),
                            gc_collected: measurement.gcCollected,
                            batches: measurement.batches,
                            max_batch_us: resultValue(
                                output.capabilities.timed ? measurement.maxBatchUs : undefined,
                            ),
                            checksum: work.checksum(),
                        }),
                    );
                }
                work.dispose();
                owner.remove(dispose);
                round++;
                if (round < ROUNDS) {
                    pump.later(runRound);
                    return;
                }
                if (mode === "native") {
                    mode = "rx";
                    round = -1;
                    pump.later(runRound);
                    return;
                }
                const native = values.native.length === ROUNDS ? median(values.native) : undefined;
                const rx = values.rx.length === ROUNDS ? median(values.rx) : undefined;
                const perEvent = rx === undefined ? undefined : rx / ITERATIONS;
                records.push(
                    output.row({
                        type: "summary",
                        id: spec.id,
                        operations: ITERATIONS,
                        native_ms: resultValue(native),
                        rx_ms: resultValue(rx),
                        native_ms_op: resultValue(
                            native === undefined ? undefined : native / ITERATIONS,
                        ),
                        rx_ms_op: resultValue(perEvent),
                        ratio: resultValue(ratio(rx, native)),
                        native_alloc_kb_op: resultValue(
                            memory.native.length === ROUNDS ? median(memory.native) : undefined,
                        ),
                        rx_alloc_kb_op: resultValue(
                            memory.rx.length === ROUNDS ? median(memory.rx) : undefined,
                        ),
                    }),
                );
                if (spec.width === 20)
                    records.push(
                        output.row({
                            type: "goal",
                            id: "G1",
                            source: spec.id,
                            status: dispatchGoal(perEvent),
                        }),
                    );
                logger.info(
                    `${spec.id}：原生 ${native ?? "無法量測"} ms，RxWC3 ${rx ?? "無法量測"} ms，倍數 ${ratio(rx, native) ?? "無法判定"}。`,
                );
                caseIndex++;
                pump.later(nextCase);
            };
            pump.later(batch);
        };
        runRound();
    };
    logger.info("開始 B1 至 B4。每組暖身 1000 次，再量測 5 輪。可用 -bench-stop 停止。");
    pump.later(nextCase);
}
