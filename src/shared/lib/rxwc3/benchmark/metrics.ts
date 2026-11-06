/** 時間以秒讀取，累計成本使用整數微秒。記憶體單位為 KB。 */
export interface ProbeFunctions {
    clock?: (this: void) => number;
    memory?: (this: void) => number;
    collect?: (this: void) => void;
    stopGc?: (this: void) => void;
    restartGc?: (this: void) => void;
}

export function readNumber(fn?: (this: void) => number): number | undefined {
    if (fn === undefined) return undefined;
    try {
        const value = fn();
        return Number.isFinite(value) && value >= 0 ? value : undefined;
    } catch {
        return undefined;
    }
}

export function attempt(fn?: (this: void) => void): boolean {
    if (fn === undefined) return false;
    try {
        fn();
        return true;
    } catch {
        return false;
    }
}

export function probe(functions: ProbeFunctions) {
    let previous = readNumber(functions.clock);
    let clock = previous !== undefined;
    let resolution: number | undefined;
    for (let index = 0; index < 4096 && clock; index++) {
        const current = readNumber(functions.clock);
        if (current === undefined || current < previous!) {
            clock = false;
            break;
        }
        const difference = current - previous!;
        if (difference > 0 && (resolution === undefined || difference < resolution))
            resolution = difference;
        previous = current;
    }
    const memory = readNumber(functions.memory) !== undefined;
    const collect = memory && attempt(functions.collect);
    let pauseGc = false;
    if (memory && functions.restartGc !== undefined) {
        pauseGc = attempt(functions.stopGc);
        if (!attempt(functions.restartGc)) pauseGc = false;
    }
    // 沒有觀察到時鐘前進時，不使用零成本推論效能。
    return {
        clock,
        resolution,
        memory,
        collect,
        pauseGc,
        timed: clock && resolution !== undefined,
    };
}

export type ProbeResult = ReturnType<typeof probe>;

export function median(values: readonly number[]): number | undefined {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function ratio(rx?: number, native?: number): number | undefined {
    return rx !== undefined && native !== undefined && native > 0 ? rx / native : undefined;
}

export function elapsedUs(start?: number, end?: number): number | undefined {
    if (start === undefined || end === undefined || end < start) return undefined;
    const value = Math.floor((end - start) * 1000000 + 0.5);
    return value <= 2147483000 ? value : undefined;
}

/** 少於五個探測刻度時，保留原始數字，但不判定效能目標。 */
export function resolvedMs(microseconds?: number, resolution?: number): number | undefined {
    return microseconds !== undefined &&
        resolution !== undefined &&
        microseconds >= resolution * 5000000
        ? microseconds / 1000
        : undefined;
}

export const GoalStatus = { Pass: "pass", Fail: "fail", Unknown: "unknown" } as const;
export type GoalStatus = (typeof GoalStatus)[keyof typeof GoalStatus];

export function dispatchGoal(ms?: number): GoalStatus {
    return ms === undefined ? GoalStatus.Unknown : ms < 0.05 ? GoalStatus.Pass : GoalStatus.Fail;
}

export function timerGoal(ordered: boolean, completed: number, timers: number): GoalStatus {
    return ordered && completed === 500 && timers === 2 ? GoalStatus.Pass : GoalStatus.Fail;
}

/** G2 仍須人工觀察畫面。G3 尚未定義配置量與記憶體趨勢的門檻。 */
export function observationalGoal(): GoalStatus {
    return GoalStatus.Unknown;
}
