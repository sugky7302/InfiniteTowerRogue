import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    Clock,
    debounceTime,
    delay,
    empty,
    finalize,
    installClockDriver,
    interval,
    Observable,
    of,
    Phase,
    Subject,
    take,
    takeUntil,
    throttleTime,
    timer,
    uiClock,
    worldClock,
} from "../../src/shared/lib/rxwc3";
import { FakeClockDriver } from "./fake-clock-driver";

function setup(): { clock: Clock; driver: FakeClockDriver } {
    const driver = new FakeClockDriver();
    return { clock: new Clock(driver), driver };
}

test("timer 到期送出零後完成，任務與喚醒均移除", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    let completed = 0;
    const sub = timer(2, { clock }).subscribe({
        next: (value) => values.push(value),
        complete: () => completed++,
    });
    driver.advance(1);
    assert.deepEqual(values, []);
    driver.advance(1);
    assert.deepEqual(values, [0]);
    assert.equal(completed, 1);
    assert.equal(sub.closed, true);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("timer 零秒仍透過驅動器送出，取消不送出完成通知", () => {
    const { clock, driver } = setup();
    let completed = false;
    const sub = timer(0, { clock }).subscribe({
        next: () => assert.fail("不可送出"),
        complete: () => {
            completed = true;
        },
    });
    sub.unsubscribe();
    driver.advance(1);
    assert.equal(completed, false);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("timer 的非法時間與未安裝驅動器錯誤送至訂閱者", () => {
    const { clock } = setup();
    for (const source of [timer(NaN, { clock }), timer(1, { clock: new Clock() })]) {
        let error: unknown;
        const sub = source.subscribe({
            error: (caught) => {
                error = caught;
            },
        });
        assert.ok(error instanceof Error);
        assert.equal(sub.closed, true);
    }
});

test("interval 以開始時間加上次數乘週期計算，不累積回呼延遲", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    const sub = interval(0.1, { clock }).subscribe((value) => values.push(value));
    driver.elapseWithoutWake(0.35);
    driver.fire();
    assert.deepEqual(values, [0, 1, 2]);
    driver.advance(0.05);
    assert.deepEqual(values, [0, 1, 2, 3]);
    driver.advance(9.6);
    assert.equal(values.length, 100);
    assert.equal(values[99], 99);
    assert.equal((sub as unknown as { teardowns: unknown[] }).teardowns.length, 1);
    sub.unsubscribe();
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("interval 將非整數毫秒週期四捨五入，再以整數毫秒排程", () => {
    const { clock, driver } = setup();
    const times: number[] = [];
    interval(0.0016, { clock })
        .pipe(take(1000))
        .subscribe(() => times.push(clock.now()));
    driver.advance(2);
    assert.equal(times.length, 1000);
    assert.equal(times[999], 2);
    assert.equal(clock.pendingCount(), 0);
});

test("interval 經由 take 完成時不再排程，也不保留完成任務", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    let completed = 0;
    const sub = interval(1, { clock })
        .pipe(take(3))
        .subscribe({ next: (value) => values.push(value), complete: () => completed++ });
    driver.advance(5);
    assert.deepEqual(values, [0, 1, 2]);
    assert.equal(completed, 1);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
    assert.equal((sub as unknown as { teardowns: unknown[] }).teardowns.length, 0);
});

test("interval 的錯誤通知會清理週期任務", () => {
    const { clock, driver } = setup();
    const stop = new Subject<void>();
    let error: unknown;
    interval(1, { clock })
        .pipe(takeUntil(stop))
        .subscribe({
            error: (caught) => {
                error = caught;
            },
        });
    stop.error("停止錯誤");
    driver.advance(3);
    assert.equal(error, "停止錯誤");
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("interval 拒絕零週期、負週期、非有限週期與小於解析度的週期", () => {
    const { clock } = setup();
    for (const period of [0, -1, NaN, Infinity, 0.0000001, 0.0000006]) {
        let error: unknown;
        interval(period, { clock }).subscribe({
            error: (caught) => {
                error = caught;
            },
        });
        assert.ok(error instanceof Error);
        assert.equal(clock.pendingCount(), 0);
    }
});

test("delay 每個值分別延後，來源完成後等待全部值送出", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    const events: string[] = [];
    source.pipe(delay(2, { clock })).subscribe({
        next: (value) => events.push(String(value)),
        complete: () => events.push("完成"),
    });
    source.next(1);
    driver.advance(1);
    source.next(2);
    source.complete();
    driver.advance(1);
    assert.deepEqual(events, ["1"]);
    driver.advance(1);
    assert.deepEqual(events, ["1", "2", "完成"]);
    assert.equal(clock.pendingCount(), 0);
});

test("delay 支援同步來源與空來源，空來源立即完成", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    const sub = of(1, 2, 3)
        .pipe(delay(1, { clock }))
        .subscribe((value) => values.push(value));
    assert.equal(sub.closed, false);
    assert.equal(empty().pipe(delay(1, { clock })).subscribe().closed, true);
    driver.advance(1);
    assert.deepEqual(values, [1, 2, 3]);
    assert.equal(sub.closed, true);
});

test("delay 錯誤立即傳遞並取消待送值", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    let error: unknown;
    const values: number[] = [];
    source.pipe(delay(2, { clock })).subscribe({
        next: (value) => values.push(value),
        error: (caught) => {
            error = caught;
        },
    });
    source.next(1);
    source.next(2);
    source.error("延遲錯誤");
    assert.equal(error, "延遲錯誤");
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
    driver.advance(10);
    assert.deepEqual(values, []);
});

test("delay 取消會移除全部任務與來源訂閱", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    let cleaned = 0;
    const sub = source
        .pipe(
            finalize(() => cleaned++),
            delay(2, { clock }),
        )
        .subscribe(() => assert.fail("不可送出"));
    source.next(1);
    source.next(2);
    sub.unsubscribe();
    assert.equal(cleaned, 1);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("debounceTime 重設倒數，只送出最後值", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    const values: number[] = [];
    const sub = source.pipe(debounceTime(2, { clock })).subscribe((value) => values.push(value));
    source.next(1);
    driver.advance(1);
    source.next(2);
    assert.equal(clock.pendingCount(), 1);
    driver.advance(1.5);
    assert.deepEqual(values, []);
    driver.advance(0.5);
    assert.deepEqual(values, [2]);
    assert.equal(clock.pendingCount(), 0);
    source.next(3);
    driver.advance(2);
    assert.deepEqual(values, [2, 3]);
    sub.unsubscribe();
});

test("debounceTime 完成時立即送出最後值，然後完成", () => {
    const { clock, driver } = setup();
    const events: string[] = [];
    const sub = of(1, 2, 3)
        .pipe(debounceTime(5, { clock }))
        .subscribe({
            next: (value) => events.push(String(value)),
            complete: () => events.push("完成"),
        });
    assert.deepEqual(events, ["3", "完成"]);
    assert.equal(sub.closed, true);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("debounceTime 空來源完成時不送出值", () => {
    const { clock } = setup();
    assert.equal(
        empty()
            .pipe(debounceTime(2, { clock }))
            .subscribe(() => assert.fail("不可送出")).closed,
        true,
    );
});

test("debounceTime 錯誤立即取消待送值", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    let error: unknown;
    source.pipe(debounceTime(2, { clock })).subscribe({
        next: () => assert.fail("不可送出"),
        error: (caught) => {
            error = caught;
        },
    });
    source.next(1);
    source.error("防抖錯誤");
    assert.equal(error, "防抖錯誤");
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("debounceTime 取消會清理任務與來源", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    let cleaned = 0;
    const sub = source
        .pipe(
            finalize(() => cleaned++),
            debounceTime(2, { clock }),
        )
        .subscribe(() => assert.fail("不可送出"));
    source.next(1);
    sub.unsubscribe();
    driver.advance(4);
    assert.equal(cleaned, 1);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

for (const leading of [true, false]) {
    for (const trailing of [true, false]) {
        test(`throttleTime 支援前端 ${leading} 與尾端 ${trailing}`, () => {
            const { clock, driver } = setup();
            const source = new Subject<number>();
            const values: number[] = [];
            const sub = source
                .pipe(throttleTime(2, { clock, leading, trailing }))
                .subscribe((value) => values.push(value));
            source.next(1);
            driver.advance(0.5);
            source.next(2);
            driver.advance(0.5);
            source.next(3);
            driver.advance(1);
            assert.deepEqual(values, [...(leading ? [1] : []), ...(trailing ? [3] : [])]);
            sub.unsubscribe();
            assert.equal(clock.pendingCount(), 0);
            assert.equal(driver.isArmed(), false);
        });
    }
}

test("throttleTime 預設立即送出第一值，期間忽略其餘值", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    const values: number[] = [];
    const sub = source.pipe(throttleTime(2, { clock })).subscribe((value) => values.push(value));
    source.next(1);
    source.next(2);
    driver.advance(2);
    source.next(3);
    source.complete();
    assert.deepEqual(values, [1, 3]);
    assert.equal(sub.closed, true);
    assert.equal(clock.pendingCount(), 0);
});

test("throttleTime 尾端值送出後建立新視窗，來源完成時等待待送值", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    const events: string[] = [];
    source.pipe(throttleTime(2, { clock, trailing: true })).subscribe({
        next: (value) => events.push(String(value)),
        complete: () => events.push("完成"),
    });
    source.next(1);
    source.next(2);
    driver.advance(2);
    source.next(3);
    source.next(4);
    source.complete();
    assert.deepEqual(events, ["1", "2"]);
    driver.advance(2);
    assert.deepEqual(events, ["1", "2", "4", "完成"]);
    assert.equal(clock.pendingCount(), 0);
});

test("throttleTime 沒有待送值時完成不等待視窗", () => {
    const { clock } = setup();
    assert.equal(
        of(1)
            .pipe(throttleTime(2, { clock, trailing: true }))
            .subscribe().closed,
        true,
    );
    assert.equal(empty().pipe(throttleTime(2, { clock })).subscribe().closed, true);
    assert.equal(clock.pendingCount(), 0);
});

test("throttleTime 僅啟用尾端時，來源完成仍等待第一值", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    const sub = of(1)
        .pipe(throttleTime(2, { clock, leading: false, trailing: true }))
        .subscribe((value) => values.push(value));
    assert.equal(sub.closed, false);
    driver.advance(2);
    assert.deepEqual(values, [1]);
    assert.equal(sub.closed, true);
});

test("throttleTime 錯誤會取消尾端值與視窗", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    const values: number[] = [];
    let error: unknown;
    source.pipe(throttleTime(2, { clock, trailing: true })).subscribe({
        next: (value) => values.push(value),
        error: (caught) => {
            error = caught;
        },
    });
    source.next(1);
    source.next(2);
    source.error("節流錯誤");
    driver.advance(2);
    assert.equal(error, "節流錯誤");
    assert.deepEqual(values, [1]);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("throttleTime 取消會清理視窗與來源", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    let cleaned = 0;
    const sub = source
        .pipe(
            finalize(() => cleaned++),
            throttleTime(2, { clock, leading: false, trailing: true }),
        )
        .subscribe(() => assert.fail("不可送出"));
    source.next(1);
    sub.unsubscribe();
    driver.advance(2);
    assert.equal(cleaned, 1);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("throttleTime 的訂閱者重入不能繞過視窗", () => {
    const { clock, driver } = setup();
    const source = new Subject<number>();
    const values: number[] = [];
    const sub = source.pipe(throttleTime(2, { clock, trailing: true })).subscribe((value) => {
        values.push(value);
        if (value < 3) source.next(value + 1);
    });
    source.next(1);
    driver.advance(4);
    assert.deepEqual(values, [1, 2, 3]);
    sub.unsubscribe();
});

for (const operator of [delay, debounceTime, throttleTime]) {
    test(`${operator.name} 非法秒數會走錯誤路徑，且不啟動來源`, () => {
        const { clock } = setup();
        let started = false;
        let error: unknown;
        new Observable<number>(() => {
            started = true;
        })
            .pipe(operator(NaN, { clock }))
            .subscribe({
                error: (caught) => {
                    error = caught;
                },
            });
        assert.equal(started, false);
        assert.ok(error instanceof Error);
        assert.equal(clock.pendingCount(), 0);
    });
}

test("timer 與三個時間 operator 均傳遞結算階段", () => {
    for (const operator of [delay, debounceTime, throttleTime]) {
        const { clock, driver } = setup();
        const values: string[] = [];
        timer(1, { clock, phase: Phase.World }).subscribe(() => values.push("世界"));
        const source = new Subject<number>();
        const sub = source
            .pipe(operator(1, { clock, phase: Phase.Combat, leading: false, trailing: true }))
            .subscribe(() => values.push("戰鬥"));
        source.next(1);
        driver.advance(1);
        assert.deepEqual(values, ["戰鬥", "世界"]);
        sub.unsubscribe();
    }
});

test("interval 也傳遞結算階段", () => {
    const { clock, driver } = setup();
    const values: string[] = [];
    timer(1, { clock, phase: Phase.World }).subscribe(() => values.push("世界"));
    interval(1, { clock, phase: Phase.Combat })
        .pipe(take(1))
        .subscribe(() => values.push("戰鬥"));
    driver.advance(1);
    assert.deepEqual(values, ["戰鬥", "世界"]);
});

test("時間 operator 排程失敗時關閉來源，不保留任務", () => {
    for (const operator of [delay, debounceTime, throttleTime]) {
        let cleaned = 0;
        let error: unknown;
        const source = new Observable<number>((subscriber) => {
            subscriber.next(1);
            return () => {
                cleaned++;
            };
        });
        source.pipe(operator(1, { clock: new Clock() })).subscribe({
            error: (caught) => {
                error = caught;
            },
        });
        assert.ok(error instanceof Error);
        assert.equal(cleaned, 1);
    }
});

test("delay 送出第一值時同步取消，會取消同時到期的其他值", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    of(1, 2, 3)
        .pipe(delay(1, { clock }), take(1))
        .subscribe((value) => values.push(value));
    driver.advance(1);
    assert.deepEqual(values, [1]);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("takeUntil 中斷 timer 會移除時鐘任務與喚醒", () => {
    const { clock, driver } = setup();
    const stop = new Subject<void>();
    let completed = 0;
    timer(12, { clock })
        .pipe(takeUntil(stop))
        .subscribe({ next: () => assert.fail("不可送出"), complete: () => completed++ });
    driver.advance(5);
    stop.next();
    assert.equal(completed, 1);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("撤離整合：第 5 秒中斷、世界暫停 3 秒、介面仍前進", () => {
    const worldDriver = new FakeClockDriver();
    const uiDriver = new FakeClockDriver();
    installClockDriver(worldClock, worldDriver);
    installClockDriver(uiClock, uiDriver);
    const stop = new Subject<void>();
    let cancelledCompleted = 0;
    let extractionCompleted = false;
    let uiCompleted = false;
    timer(12, { phase: Phase.Extraction })
        .pipe(takeUntil(stop))
        .subscribe({
            next: () => assert.fail("中斷撤離不可送出值"),
            complete: () => cancelledCompleted++,
        });
    timer(12, { phase: Phase.Extraction }).subscribe(() => {
        extractionCompleted = true;
    });
    timer(6, { clock: uiClock }).subscribe(() => {
        uiCompleted = true;
    });
    worldDriver.advance(5);
    uiDriver.advance(5);
    stop.next();
    worldClock.pause();
    assert.equal(worldClock.pendingCount(), 1);
    worldDriver.advance(3);
    uiDriver.advance(3);
    assert.equal(worldClock.now(), 5);
    assert.equal(uiCompleted, true);
    assert.equal(cancelledCompleted, 1);
    worldClock.resume();
    worldDriver.advance(6.99);
    assert.equal(extractionCompleted, false);
    worldDriver.advance(0.01);
    assert.equal(extractionCompleted, true);
    assert.equal(worldDriver.realTime, 15);
    assert.equal(worldClock.pendingCount(), 0);
    assert.equal(uiClock.pendingCount(), 0);
});
