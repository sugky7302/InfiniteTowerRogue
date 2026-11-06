import { reportUnhandledError } from "../core/config";
import { Subject } from "../core/subject";
import { Phase } from "./phase";
import { ScheduledTask, Scheduler } from "./scheduler";
import { addTicks, durationTicks, TICKS_PER_SECOND, toTicks } from "./time";

export interface ClockDriver {
    // 喚醒回呼不得同步執行。elapsed 在觸發回呼時仍須保留已經過的時間。
    wakeAfter(seconds: number, callback: (this: void) => void): void;
    cancelWake(): void;
    // 量時不依賴喚醒任務。start 重設經過時間，stop 停止量時。
    start(): void;
    stop(): void;
    elapsedTicks(): number;
}

export const MAX_TASKS_PER_WAKE = 10000;

export class Clock {
    private readonly pauseState = new Subject<boolean>();
    public readonly pauseChanges = this.pauseState.asObservable();
    private readonly scheduler = new Scheduler();
    private driver: ClockDriver | undefined;
    private time = 0;
    private armed = false;
    private wakeTicks: number | undefined;
    private pauseCount = 0;
    private processing = false;
    private generation = 0;

    public constructor(driver?: ClockDriver) {
        if (driver !== undefined) this.installDriver(driver);
    }

    public installDriver(driver: ClockDriver): void {
        if (this.driver !== undefined) throw new Error("時鐘已安裝驅動器。");
        this.driver = driver;
        if (!this.isPaused()) driver.start();
    }

    public now(): number {
        return this.nowTicks() / TICKS_PER_SECOND;
    }

    public nowTicks(): number {
        return addTicks(
            this.time,
            !this.isPaused() && this.driver !== undefined ? this.driver.elapsedTicks() : 0,
        );
    }

    public isPaused(): boolean {
        return this.pauseCount > 0;
    }

    public pause(): void {
        if (this.pauseCount === 2147483647) throw new Error("暫停引用計數超過 2147483647 上限。");
        if (this.pauseCount === 0) {
            this.time = this.nowTicks();
            this.stopWake();
            this.driver?.stop();
        }
        this.pauseCount++;
        if (this.pauseCount === 1) this.pauseState.next(true);
    }

    public resume(): void {
        if (this.pauseCount === 0) return;
        if (--this.pauseCount === 0) {
            this.driver?.start();
            this.updateWake();
            this.pauseState.next(false);
        }
    }

    public pendingCount(): number {
        return this.scheduler.size();
    }

    public schedule(
        seconds: number,
        callback: (this: void) => void,
        phase: Phase = Phase.Default,
    ): ScheduledTask {
        return this.scheduleTicks(durationTicks(seconds), callback, phase);
    }

    public scheduleTicks(
        ticks: number,
        callback: (this: void) => void,
        phase: Phase = Phase.Default,
    ): ScheduledTask {
        return this.scheduleAtTicks(addTicks(this.nowTicks(), Math.max(0, ticks)), callback, phase);
    }

    public scheduleAt(
        dueSeconds: number,
        callback: (this: void) => void,
        phase: Phase = Phase.Default,
    ): ScheduledTask {
        return this.scheduleAtTicks(toTicks(dueSeconds), callback, phase);
    }

    public scheduleAtTicks(
        dueTicks: number,
        callback: (this: void) => void,
        phase: Phase = Phase.Default,
    ): ScheduledTask {
        if (this.driver === undefined) throw new Error("時鐘尚未安裝計時驅動器。");
        this.nowTicks();
        const task = this.scheduler.schedule(dueTicks, phase, callback, () => this.updateWake());
        this.updateWake();
        return task;
    }

    public cancel(task: ScheduledTask): void {
        task.unsubscribe();
    }

    private stopWake(): void {
        if (this.armed) {
            this.armed = false;
            this.wakeTicks = undefined;
            this.nextGeneration();
            this.driver!.cancelWake();
        }
    }

    private updateWake(): void {
        if (this.processing) return;
        const next = this.scheduler.peek();
        if (this.isPaused() || next === undefined) {
            this.stopWake();
            return;
        }
        if (this.armed && this.wakeTicks === next.dueTicks) return;
        this.stopWake();
        this.armed = true;
        this.wakeTicks = next.dueTicks;
        const generation = this.nextGeneration();
        // 先比較再相減，避免負到期時間與正目前時間相減時溢位。
        const current = this.nowTicks();
        this.driver!.wakeAfter(
            (next.dueTicks > current ? next.dueTicks - current : 0) / TICKS_PER_SECOND,
            () => {
                if (this.armed && generation === this.generation) this.flush();
            },
        );
    }

    private flush(): void {
        this.stopWake();
        this.processing = true;
        const currentTicks = this.nowTicks();
        let count = 0;
        try {
            while (!this.isPaused()) {
                const task = this.scheduler.peek();
                if (task === undefined || task.dueTicks > currentTicks) break;
                if (count === MAX_TASKS_PER_WAKE) {
                    // 移除目前已到期任務，避免下一次零秒喚醒再次形成無限迴圈。
                    while (
                        this.scheduler.peek() !== undefined &&
                        this.scheduler.peek()!.dueTicks <= currentTicks
                    ) {
                        this.scheduler.pop()!.unsubscribe();
                    }
                    reportUnhandledError(
                        new Error("單次時鐘處理超過 10000 個任務，已取消其餘到期任務。"),
                    );
                    break;
                }
                this.scheduler.pop();
                const callback = task.callback;
                task.unsubscribe();
                count++;
                try {
                    if (callback !== undefined) callback();
                } catch (error) {
                    reportUnhandledError(error);
                }
            }
        } finally {
            this.processing = false;
            this.updateWake();
        }
    }

    private nextGeneration(): number {
        this.generation = this.generation === 2147483647 ? 0 : this.generation + 1;
        return this.generation;
    }
}

export function installClockDriver(clock: Clock, driver: ClockDriver): void {
    clock.installDriver(driver);
}
