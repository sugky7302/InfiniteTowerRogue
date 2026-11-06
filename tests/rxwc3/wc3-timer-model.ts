import { strict as assert } from "node:assert";
import { Clock, Phase, ScheduledTask, Wc3ClockDriver } from "../../src/shared/lib/rxwc3";

export function int32(value: number): number {
    assert.ok(
        Number.isInteger(value) && value >= -2147483648 && value <= 2147483647,
        `時間超出 int32 範圍：${value}`,
    );
    return value;
}

class CheckedClock extends Clock {
    public override nowTicks(): number {
        return int32(super.nowTicks());
    }

    public override scheduleAtTicks(
        ticks: number,
        callback: (this: void) => void,
        phase?: Phase,
    ): ScheduledTask {
        return super.scheduleAtTicks(int32(ticks), callback, phase);
    }
}

interface NativeTimer {
    started: number;
    due?: number;
    callback?: () => void;
}

// 測試主機使用 double 保存實際時間。原生計時器邊界只傳入 float32。
export class Wc3TimerModel {
    public realTime = 0;
    public readonly driver = new Wc3ClockDriver();
    public readonly clock: Clock;
    private readonly timers = new Set<NativeTimer>();
    private readonly saved = new Map<string, PropertyDescriptor | undefined>();

    public constructor() {
        const replace = (name: string, value: unknown) => {
            this.saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
            Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
        };
        replace("CreateTimer", () => {
            const timer: NativeTimer = { started: this.realTime };
            this.timers.add(timer);
            return timer;
        });
        replace("PauseTimer", (timer: NativeTimer) => {
            timer.due = undefined;
        });
        replace("DestroyTimer", (timer: NativeTimer) => {
            this.timers.delete(timer);
        });
        replace("TimerGetElapsed", (timer: NativeTimer) =>
            Math.fround(this.realTime - timer.started),
        );
        replace(
            "TimerStart",
            (timer: NativeTimer, seconds: number, periodic: boolean, callback: () => void) => {
                assert.equal(periodic, false);
                assert.ok(seconds >= 0 && seconds <= 60);
                timer.started = this.realTime;
                timer.due = this.realTime + Math.fround(seconds);
                timer.callback = callback;
            },
        );
        this.clock = new CheckedClock(this.driver);
    }

    public timerCount(): number {
        return this.timers.size;
    }

    public advance(seconds: number): void {
        const end = this.realTime + seconds;
        let count = 0;
        while (true) {
            let next: NativeTimer | undefined;
            for (const timer of this.timers) {
                if (
                    timer.due !== undefined &&
                    timer.due <= end &&
                    (next === undefined || timer.due < next.due!)
                )
                    next = timer;
            }
            if (next === undefined) break;
            if (++count > 1000000) throw new Error("原生計時器模擬超過回呼上限。");
            this.realTime = next.due!;
            next.due = undefined;
            int32(this.driver.elapsedTicks());
            next.callback!();
            // 同時檢查驅動器整數基準與時鐘保存的整數時間。
            int32((this.driver as unknown as { ticks: number }).ticks);
            int32((this.clock as unknown as { time: number }).time);
            this.clock.nowTicks();
        }
        this.realTime = end;
        this.clock.nowTicks();
    }

    public restore(): void {
        this.driver.stop();
        for (const [name, descriptor] of this.saved) {
            if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
            else Object.defineProperty(globalThis, name, descriptor);
        }
    }
}
