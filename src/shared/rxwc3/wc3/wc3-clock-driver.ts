import { ClockDriver, installClockDriver } from "../scheduler/clock";
import { uiClock, worldClock } from "../scheduler/clocks";
import { addTicks, toTicks } from "../scheduler/time";

// 計時器原生函式與 `timer` 型別來自 war3-types-strict 的全域宣告。

export class Wc3ClockDriver implements ClockDriver {
    private timer: timer | undefined;
    private measuring: timer | undefined;
    private ticks = 0;

    public start(): void {
        if (this.measuring !== undefined) return;
        this.ticks = 0;
        this.measuring = CreateTimer();
        // 每分鐘重設原生浮點經過時間，只累加整數毫秒。
        const rollover = () => {
            this.ticks = addTicks(this.ticks, toTicks(TimerGetElapsed(this.measuring!)));
            TimerStart(this.measuring!, 60, false, rollover);
        };
        TimerStart(this.measuring, 60, false, rollover);
    }

    public stop(): void {
        this.cancelWake();
        if (this.measuring !== undefined) {
            PauseTimer(this.measuring);
            DestroyTimer(this.measuring);
            this.measuring = undefined;
        }
    }

    public wakeAfter(seconds: number, callback: (this: void) => void): void {
        if (this.timer === undefined) this.timer = CreateTimer();
        // 最多等待一分鐘，再由時鐘檢查整數到期時間。
        TimerStart(this.timer, Math.min(seconds, 60), false, callback);
    }

    public cancelWake(): void {
        if (this.timer !== undefined) {
            PauseTimer(this.timer);
            DestroyTimer(this.timer);
            this.timer = undefined;
        }
    }

    public elapsedTicks(): number {
        return this.measuring === undefined
            ? 0
            : addTicks(this.ticks, toTicks(TimerGetElapsed(this.measuring)));
    }

    public hasTimer(): boolean {
        return this.measuring !== undefined || this.timer !== undefined;
    }

    public hasWakeTimer(): boolean {
        return this.timer !== undefined;
    }
}

export function installWc3ClockDrivers(): { world: Wc3ClockDriver; ui: Wc3ClockDriver } {
    const world = new Wc3ClockDriver();
    const ui = new Wc3ClockDriver();
    installClockDriver(worldClock, world);
    installClockDriver(uiClock, ui);
    return { world, ui };
}
