import { resultValue } from "../results";
import { logger } from "../../../logger";
import { Clock, delay, of, Subscription, timer, Wc3ClockDriver } from "../../index";
import { Measurement } from "../measurement";
import { attempt, elapsedUs, median, ratio, readNumber, timerGoal } from "../metrics";
import { Mode } from "../workloads";
import { Output, Pump } from "./runtime";

/** 包住完整喚醒工作，包含排程分發與回呼。等待時間不計入 CPU 成本。 */
export class CallbackMeter {
    public us: number | undefined;
    public allocation: number | undefined;
    public netKb: number | undefined;
    public constructor(private readonly output: Output) {
        this.us = output.capabilities.timed ? 0 : undefined;
        this.allocation = output.capabilities.pauseGc ? 0 : undefined;
        this.netKb = output.capabilities.memory ? 0 : undefined;
    }
    public measure(callback: (this: void) => void): void {
        const p = this.output;
        const paused = p.capabilities.pauseGc && attempt(p.functions.stopGc);
        if (!paused) this.allocation = undefined;
        const before = p.capabilities.memory ? readNumber(p.functions.memory) : undefined;
        const start = p.capabilities.timed ? readNumber(p.functions.clock) : undefined;
        try {
            callback();
        } finally {
            const end = p.capabilities.timed ? readNumber(p.functions.clock) : undefined;
            const after = p.capabilities.memory ? readNumber(p.functions.memory) : undefined;
            const us = elapsedUs(start, end);
            if (us === undefined) this.us = undefined;
            else if (this.us !== undefined)
                this.us = us > 2147483000 - this.us ? undefined : this.us + us;
            if (before === undefined || after === undefined || after < before)
                this.allocation = undefined;
            else if (this.allocation !== undefined) this.allocation += after - before;
            if (before === undefined || after === undefined) this.netKb = undefined;
            else if (this.netKb !== undefined) this.netKb += after - before;
            if (paused && !attempt(p.functions.restartGc)) this.allocation = undefined;
        }
    }
}

class MeasuredDriver extends Wc3ClockDriver {
    public constructor(private readonly meter: CallbackMeter) {
        super();
    }
    public wakeAfter(seconds: number, callback: (this: void) => void): void {
        super.wakeAfter(seconds, () => this.meter.measure(callback));
    }
}

export function runTimers(
    output: Output,
    parent: Subscription,
    records: string[],
    done: (this: void) => void,
): void {
    const pump = new Pump(parent);
    let kind: "timer" | "delay" = "timer";
    let mode: Mode = "native";
    // 兩個 500 任務的波次，共暖身 1000 次。
    let round = -2;
    const costs: Record<Mode, number[]> = { native: [], rx: [] };
    const allocations: Record<Mode, number[]> = { native: [], rx: [] };
    let allCorrect = true;
    const wave = (): void => {
        const owner = new Subscription();
        parent.add(owner);
        const meter = new CallbackMeter(output);
        const driver = new MeasuredDriver(meter);
        const clock = mode === "rx" ? new Clock(driver) : undefined;
        const nativeTimers = new Set<timer>();
        const wall = CreateTimer();
        TimerStart(wall, 60, false, () => {});
        owner.add(() => {
            for (const handle of nativeTimers) {
                PauseTimer(handle);
                DestroyTimer(handle);
            }
            nativeTimers.clear();
            clock?.pause();
            PauseTimer(wall);
            DestroyTimer(wall);
        });
        let index = 0;
        let completed = 0;
        let ordered = true;
        let timerCount = 0;
        let peakPending = 0;
        const baseTicks = clock?.nowTicks() ?? 0;
        const setup = new Measurement(
            {
                step: () => {
                    const id = index++;
                    // 使用共同絕對期限，避免分批建立改變預期順序。
                    const dueTicks = 1000 + id * 4;
                    const receive = (): void => {
                        if (completed !== id) ordered = false;
                        completed++;
                    };
                    if (clock !== undefined) {
                        const seconds = Math.max(0, baseTicks + dueTicks - clock.nowTicks()) / 1000;
                        const source =
                            kind === "timer"
                                ? timer(seconds, { clock })
                                : of(id).pipe(delay(seconds, { clock }));
                        owner.add(source.subscribe(receive));
                        peakPending = Math.max(peakPending, clock.pendingCount());
                        timerCount = Math.max(
                            timerCount,
                            (driver.hasTimer() ? 1 : 0) + (driver.hasWakeTimer() ? 1 : 0),
                        );
                    } else {
                        const handle = CreateTimer();
                        nativeTimers.add(handle);
                        peakPending = Math.max(peakPending, nativeTimers.size);
                        timerCount = Math.max(timerCount, nativeTimers.size);
                        TimerStart(
                            handle,
                            Math.max(0, dueTicks / 1000 - TimerGetElapsed(wall)),
                            false,
                            () => {
                                try {
                                    meter.measure(() => {
                                        receive();
                                        nativeTimers.delete(handle);
                                        DestroyTimer(handle);
                                    });
                                } catch (error) {
                                    logger.error(error);
                                    parent.unsubscribe();
                                }
                            },
                        );
                    }
                },
                checksum: () => index,
                dispose: () => {},
            },
            output.functions,
            output.capabilities,
        );
        const check = (): void => {
            const wallMs = Math.floor(TimerGetElapsed(wall) * 1000 + 0.5);
            if (completed < 500 && wallMs < 8000) {
                pump.later(check, 0.05);
                return;
            }
            const cpu =
                setup.microseconds === undefined || meter.us === undefined
                    ? undefined
                    : (setup.microseconds + meter.us) / 1000;
            if (round >= 0) {
                const allocation =
                    setup.allocationKb === undefined || meter.allocation === undefined
                        ? undefined
                        : (setup.allocationKb + meter.allocation) / 500;
                records.push(
                    output.row({
                        type: "round",
                        id: `B4-${kind}`,
                        mode,
                        round: round + 1,
                        operations: 500,
                        setup_ms: resultValue(
                            setup.microseconds === undefined
                                ? undefined
                                : setup.microseconds / 1000,
                        ),
                        dispatch_ms: resultValue(
                            meter.us === undefined ? undefined : meter.us / 1000,
                        ),
                        cpu_ms: resultValue(cpu),
                        wall_ms: wallMs,
                        ms_op: resultValue(cpu === undefined ? undefined : cpu / 500),
                        alloc_kb_op: resultValue(allocation),
                        net_kb_op: resultValue(
                            setup.netKb === undefined || meter.netKb === undefined
                                ? undefined
                                : (setup.netKb + meter.netKb) / 500,
                        ),
                        gc_collected: setup.gcCollected,
                        completed,
                        ordered,
                        pending_peak: peakPending,
                        timers: timerCount,
                        timer_scope: "workload_clock",
                        max_batch_us: resultValue(
                            output.capabilities.timed ? setup.maxBatchUs : undefined,
                        ),
                        goal: "G4",
                        status:
                            mode === "rx"
                                ? timerGoal(ordered && peakPending === 500, completed, timerCount)
                                : "unknown",
                    }),
                );
                if (cpu !== undefined) costs[mode].push(cpu);
                if (allocation !== undefined) allocations[mode].push(allocation);
                if (mode === "rx")
                    allCorrect =
                        allCorrect &&
                        timerGoal(ordered && peakPending === 500, completed, timerCount) === "pass";
            }
            owner.unsubscribe();
            parent.remove(owner);
            round++;
            if (round < 5) {
                pump.later(wave);
                return;
            }
            if (mode === "native") {
                mode = "rx";
                round = -2;
                pump.later(wave);
                return;
            }
            const native = costs.native.length === 5 ? median(costs.native) : undefined;
            const rx = costs.rx.length === 5 ? median(costs.rx) : undefined;
            records.push(
                output.row({
                    type: "summary",
                    id: `B4-${kind}`,
                    native_ms: resultValue(native),
                    rx_ms: resultValue(rx),
                    native_ms_op: resultValue(native === undefined ? undefined : native / 500),
                    rx_ms_op: resultValue(rx === undefined ? undefined : rx / 500),
                    ratio: resultValue(ratio(rx, native)),
                    native_alloc_kb_op: resultValue(
                        allocations.native.length === 5 ? median(allocations.native) : undefined,
                    ),
                    rx_alloc_kb_op: resultValue(
                        allocations.rx.length === 5 ? median(allocations.rx) : undefined,
                    ),
                    goal: "G4",
                    status: allCorrect ? "pass" : "fail",
                }),
            );
            logger.info(
                `B4 ${kind}：順序與數量${allCorrect ? "通過" : "未通過"}，原生 ${native ?? "無法量測"} ms，RxWC3 ${rx ?? "無法量測"} ms。`,
            );
            if (kind === "timer") {
                kind = "delay";
                mode = "native";
                round = -2;
                costs.native = [];
                costs.rx = [];
                allCorrect = true;
                allocations.native = [];
                allocations.rx = [];
                pump.later(wave);
            } else done();
        };
        const batch = (): void => {
            setup.runBatch(500 - setup.completed);
            if (setup.completed < 500) pump.later(batch);
            else pump.later(check, 0.05);
        };
        pump.later(batch);
    };
    logger.info("開始 B4：每波 500 個任務，分別檢查 timer 與 delay。計時器數量只計入基準時鐘。");
    pump.later(wave);
}
