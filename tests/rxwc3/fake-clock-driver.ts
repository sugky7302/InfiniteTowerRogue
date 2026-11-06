import { ClockDriver } from "../../src/shared/lib/rxwc3/scheduler/clock";
import { toTicks } from "../../src/shared/lib/rxwc3/scheduler/time";

export class FakeClockDriver implements ClockDriver {
    public realTime = 0;
    public wakes = 0;
    public cancels = 0;
    private started = 0;
    private due: number | undefined;
    private callback: ((this: void) => void) | undefined;

    public start(): void {
        this.started = this.realTime;
    }

    public stop(): void {
        this.cancelWake();
    }

    public wakeAfter(seconds: number, callback: (this: void) => void): void {
        this.due = this.realTime + seconds;
        this.callback = callback;
        this.wakes++;
    }

    public cancelWake(): void {
        this.due = undefined;
        this.callback = undefined;
        this.cancels++;
    }

    public elapsedTicks(): number {
        return toTicks(this.realTime - this.started);
    }

    public isArmed(): boolean {
        return this.due !== undefined;
    }

    public advance(seconds: number): void {
        const end = this.realTime + seconds;
        let count = 0;
        while (this.due !== undefined && this.due <= end + 1e-10) {
            if (++count > 100000) throw new Error("假驅動器喚醒次數超過上限。");
            this.realTime = Math.max(this.realTime, this.due);
            const callback = this.callback!;
            this.due = undefined;
            callback();
        }
        this.realTime = end;
    }

    // 模擬驅動器晚於到期時間才交付回呼。
    public elapseWithoutWake(seconds: number): void {
        this.realTime += seconds;
    }

    public fire(): void {
        const callback = this.callback!;
        this.due = undefined;
        callback();
    }
}
