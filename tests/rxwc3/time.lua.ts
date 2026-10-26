import {
    Clock,
    config,
    debounceTime,
    delay,
    interval,
    MAX_TASKS_PER_WAKE,
    of,
    Phase,
    Subject,
    take,
    takeUntil,
    throttleTime,
    timer,
} from "../../src/shared/rxwc3";
import { FakeClockDriver } from "./fake-clock-driver";
import { MAX_SECONDS, MAX_TICKS, toTicks } from "../../src/shared/rxwc3/scheduler/time";

declare const math: { type(this: void, value: number): string };

function check(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

// 由 Lua 驗證工具轉譯並執行，不由 Node 測試載入。
export function verifyTime(): number {
    let groups = 0;
    const driver = new FakeClockDriver();
    const clock = new Clock(driver);
    const phases: number[] = [];
    clock.scheduleAt(
        0.3,
        () => {
            phases.push(2);
        },
        Phase.World,
    );
    clock.scheduleAt(
        0.1 + 0.2,
        () => {
            phases.push(1);
        },
        Phase.Extraction,
    );
    clock.scheduleAt(
        0.3,
        () => {
            phases.push(0);
        },
        Phase.Combat,
    );
    driver.advance(0.1);
    check(Math.abs(clock.now() - 0.1) < 1e-10, "時鐘沒有加入已經過的時間。");
    driver.advance(0.2);
    check(
        phases.length === 3 && phases[0] === 0 && phases[1] === 1 && phases[2] === 2,
        "排程階段或浮點時間排序錯誤。",
    );
    check(clock.pendingCount() === 0 && !driver.isArmed(), "排程完成後沒有釋放喚醒。");
    groups++;

    let calls = 0;
    clock.schedule(2, () => {
        calls++;
    });
    driver.advance(1);
    const paused = clock.now();
    clock.pause();
    clock.pause();
    driver.advance(3);
    clock.resume();
    check(clock.now() === paused && clock.isPaused() && !driver.isArmed(), "暫停引用計數錯誤。");
    clock.resume();
    driver.advance(1);
    check(calls === 1 && !clock.isPaused(), "恢復後剩餘時間錯誤。");
    groups++;

    let done = 0;
    const values: number[] = [];
    timer(2, { clock }).subscribe({
        next: function (this: void, value: number): void {
            values.push(value);
        },
        complete: () => {
            done++;
        },
    });
    driver.advance(2);
    check(
        values.length === 1 && values[0] === 0 && done === 1,
        `timer 送出或完成錯誤。值數：${values.length}，完成數：${done}，任務數：${clock.pendingCount()}，時間：${clock.now()}`,
    );
    const stop = new Subject<void>();
    timer(12, { clock })
        .pipe(takeUntil(stop))
        .subscribe(() => {
            throw new Error("取消後不可送出值。");
        });
    driver.advance(5);
    stop.next();
    check(clock.pendingCount() === 0 && !driver.isArmed(), "takeUntil 沒有移除計時任務。");
    groups++;

    const reentrant: number[] = [];
    clock.schedule(0, () => {
        reentrant.push(1);
        clock.schedule(
            0,
            () => {
                reentrant.push(3);
            },
            Phase.Combat,
        );
        reentrant.push(2);
    });
    driver.advance(0);
    check(
        reentrant.length === 3 && reentrant[1] === 2 && reentrant[2] === 3,
        "執行中加入任務的順序錯誤。",
    );
    const saved = config.onUnhandledError;
    let errors = 0;
    config.onUnhandledError = () => {
        errors++;
    };
    try {
        clock.schedule(0, () => {
            throw new Error("預期任務錯誤。");
        });
        clock.schedule(0, () => {
            calls++;
        });
        driver.advance(0);
        check(errors === 1 && calls === 2, "任務錯誤沒有隔離。");
        let count = 0;
        const loop = () => {
            count++;
            clock.schedule(0, loop);
        };
        clock.schedule(0, loop);
        driver.advance(0);
        check(
            count === MAX_TASKS_PER_WAKE && errors === 2 && clock.pendingCount() === 0,
            "任務迴圈上限沒有生效。",
        );
    } finally {
        config.onUnhandledError = saved;
    }
    groups++;

    const repeated: number[] = [];
    interval(0.1, { clock })
        .pipe(take(4))
        .subscribe((value) => {
            repeated.push(value);
        });
    driver.advance(0.4);
    check(
        repeated.length === 4 &&
            repeated[0] === 0 &&
            repeated[3] === 3 &&
            clock.pendingCount() === 0,
        "interval 排程或取消錯誤。",
    );
    groups++;

    const delayed: number[] = [];
    let completed = false;
    of(1, 2)
        .pipe(delay(1, { clock }))
        .subscribe({
            next: function (this: void, value: number): void {
                delayed.push(value);
            },
            complete: () => {
                completed = true;
            },
        });
    check(!completed && delayed.length === 0, "delay 提前送出或完成。");
    driver.advance(1);
    check(completed && delayed.length === 2 && delayed[1] === 2, "delay 完成流程錯誤。");
    groups++;

    const debounced: number[] = [];
    of(1, 2)
        .pipe(debounceTime(1, { clock }))
        .subscribe((value) => {
            debounced.push(value);
        });
    check(
        debounced.length === 1 && debounced[0] === 2 && clock.pendingCount() === 0,
        "debounceTime 完成送出錯誤。",
    );
    groups++;

    const throttled: number[] = [];
    const subject = new Subject<number>();
    subject.pipe(throttleTime(1, { clock, trailing: true })).subscribe((value) => {
        throttled.push(value);
    });
    subject.next(1);
    subject.next(2);
    subject.complete();
    check(throttled.length === 1 && throttled[0] === 1, "throttleTime 前端送出錯誤。");
    driver.advance(1);
    check(
        throttled.length === 2 && throttled[1] === 2 && clock.pendingCount() === 0,
        "throttleTime 尾端送出或清理錯誤。",
    );
    groups++;
    const longDriver = new FakeClockDriver();
    const longClock = new Clock(longDriver);
    const longTimes: number[] = [];
    longClock.schedule(1080, () => {
        longTimes.push(longClock.nowTicks());
    });
    longClock.schedule(7200, () => {
        longTimes.push(longClock.nowTicks());
    });
    longDriver.advance(7200);
    check(
        longTimes.length === 2 && longTimes[0] === 1080000 && longTimes[1] === 7200000,
        "18 分鐘或 2 小時排程錯誤。",
    );
    check(
        toTicks(MAX_SECONDS) === MAX_TICKS && math.type(toTicks(MAX_SECONDS)) === "integer",
        "毫秒換算未保留 int32 整數。",
    );
    groups++;

    longDriver.advance(1080);
    check(longClock.nowTicks() === 8280000 && !longDriver.isArmed(), "閒置時鐘沒有繼續前進。");
    longClock.pause();
    longDriver.advance(7200);
    check(longClock.nowTicks() === 8280000, "閒置暫停期間時間仍前進。");
    longClock.resume();
    longDriver.advance(1);
    check(longClock.nowTicks() === 8281000, "閒置恢復時間錯誤。");
    groups++;

    const edgeDriver = new FakeClockDriver();
    const edgeClock = new Clock(edgeDriver);
    edgeDriver.advance(MAX_SECONDS - 1);
    let edgeError = false;
    interval(1, { clock: edgeClock }).subscribe({
        error: () => {
            edgeError = true;
        },
    });
    edgeDriver.advance(1);
    check(edgeError && edgeClock.pendingCount() === 0, "週期排程超過上限時沒有清理。");
    groups++;
    return groups;
}
