import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    Clock,
    config,
    installClockDriver,
    MAX_TASKS_PER_WAKE,
    Phase,
    Scheduler,
} from "../../src/shared/lib/rxwc3";
import { FakeClockDriver } from "./fake-clock-driver";

function setup(): { clock: Clock; driver: FakeClockDriver } {
    const driver = new FakeClockDriver();
    return { clock: new Clock(driver), driver };
}

test("Scheduler 依時間、階段、加入順序取出任務", () => {
    const scheduler = new Scheduler();
    const expected: { time: number; phase: Phase; order: number }[] = [];
    const phases: readonly Phase[] = [Phase.Combat, Phase.Extraction, Phase.World, Phase.Default];
    for (let index = 0; index < 300; index++) {
        const time = (index * 37) % 17;
        const phase = phases[index % phases.length];
        scheduler.schedule(time, phase, () => {});
        expected.push({ time, phase, order: index });
    }
    expected.sort((a, b) => a.time - b.time || a.phase - b.phase || a.order - b.order);
    for (const item of expected) {
        const task = scheduler.pop()!;
        assert.deepEqual(
            [task.dueTicks, task.phase, task.order],
            [item.time, item.phase, item.order],
        );
    }
    assert.equal(scheduler.pop(), undefined);
});

test("Scheduler 移除堆積中間任務後仍保留順序，取消會清除回呼", () => {
    const scheduler = new Scheduler();
    const tasks = Array.from({ length: 500 }, (_, index) =>
        scheduler.schedule((index * 37) % 503, Phase.Default, () => {}),
    );
    for (let index = 0; index < tasks.length; index += 3) tasks[index].unsubscribe();
    const expected = tasks.filter((task) => !task.closed).sort((a, b) => a.dueTicks - b.dueTicks);
    assert.equal(scheduler.size(), expected.length);
    for (const task of expected) assert.equal(scheduler.pop(), task);
    assert.equal(tasks[0].callback, undefined);
    tasks[0].unsubscribe();
    assert.equal(scheduler.size(), 0);
});

test("Clock 將反向加入的潮封、撤離、傷害依階段執行", () => {
    const { clock, driver } = setup();
    const values: string[] = [];
    clock.schedule(1, () => values.push("潮封"), Phase.World);
    clock.schedule(1, () => values.push("撤離完成"), Phase.Extraction);
    clock.schedule(1, () => values.push("傷害"), Phase.Combat);
    clock.schedule(1, () => values.push("其他甲"));
    clock.schedule(1, () => values.push("其他乙"));
    driver.advance(1);
    assert.deepEqual(values, ["傷害", "撤離完成", "潮封", "其他甲", "其他乙"]);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
});

test("Clock 先比較到期時間，再比較階段", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    clock.schedule(2, () => values.push(2), Phase.Combat);
    clock.schedule(1, () => values.push(1), Phase.World);
    driver.advance(2);
    assert.deepEqual(values, [1, 2]);
});

test("浮點加法的同一時間會依階段排序", () => {
    const { clock, driver } = setup();
    const values: string[] = [];
    clock.scheduleAt(0.3, () => values.push("世界"), Phase.World);
    clock.scheduleAt(0.1 + 0.2, () => values.push("戰鬥"), Phase.Combat);
    driver.advance(0.3);
    assert.deepEqual(values, ["戰鬥", "世界"]);
});

test("不同毫秒的任務保留時間順序", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    clock.scheduleAt(0.301, () => values.push(2), Phase.Combat);
    clock.scheduleAt(0.3, () => values.push(1), Phase.World);
    driver.advance(1);
    assert.deepEqual(values, [1, 2]);
});

test("兩次觸發之間 now 加上驅動器已經過的時間，取消重排不重複累加", () => {
    const { clock, driver } = setup();
    const first = clock.schedule(10, () => {});
    driver.advance(2.25);
    assert.equal(clock.now(), 2.25);
    clock.schedule(2, () => {});
    assert.equal(clock.now(), 2.25);
    driver.advance(1.25);
    first.unsubscribe();
    assert.equal(clock.now(), 3.5);
    driver.advance(0.75);
    assert.equal(clock.now(), 4.25);
});

test("較晚任務不重設喚醒，取消最早任務會重新等待下一個任務", () => {
    const { clock, driver } = setup();
    const first = clock.schedule(5, () => assert.fail("取消任務不可執行"));
    clock.schedule(10, () => {});
    assert.equal(driver.wakes, 1);
    driver.advance(2);
    first.unsubscribe();
    assert.equal(driver.wakes, 2);
    assert.equal(clock.pendingCount(), 1);
    driver.advance(8);
    assert.equal(clock.pendingCount(), 0);
});

test("取消最後任務停止喚醒，閒置時間仍前進", () => {
    const { clock, driver } = setup();
    const task = clock.schedule(10, () => assert.fail("取消任務不可執行"));
    driver.advance(3);
    clock.cancel(task);
    clock.cancel(task);
    assert.equal(clock.pendingCount(), 0);
    assert.equal(driver.isArmed(), false);
    driver.advance(20);
    assert.equal(clock.now(), 23);
    let called = false;
    clock.schedule(2, () => {
        called = true;
    });
    driver.advance(1);
    assert.equal(called, false);
    driver.advance(1);
    assert.equal(called, true);
});

test("暫停使用引用計數，恢復後依剩餘時間執行", () => {
    const { clock, driver } = setup();
    let called = false;
    clock.schedule(12, () => {
        called = true;
    });
    driver.advance(5);
    clock.pause();
    clock.pause();
    driver.advance(2);
    clock.resume();
    assert.equal(clock.isPaused(), true);
    assert.equal(clock.now(), 5);
    assert.equal(driver.isArmed(), false);
    driver.advance(1);
    clock.resume();
    assert.equal(clock.isPaused(), false);
    driver.advance(6.99);
    assert.equal(called, false);
    driver.advance(0.01);
    assert.equal(called, true);
    assert.equal(driver.realTime, 15);
    clock.resume();
    assert.equal(clock.isPaused(), false);
});

test("暫停前沒有任務時，暫停期間新增的任務仍須等待恢復", () => {
    const { clock, driver } = setup();
    clock.pause();
    let called = false;
    clock.schedule(0, () => {
        called = true;
    });
    driver.advance(10);
    assert.equal(called, false);
    assert.equal(clock.now(), 0);
    clock.resume();
    driver.advance(0);
    assert.equal(called, true);
});

test("執行中暫停會停止其餘到期任務，恢復後繼續", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    clock.schedule(1, () => {
        values.push(1);
        clock.pause();
    });
    clock.schedule(1, () => values.push(2));
    driver.advance(2);
    assert.deepEqual(values, [1]);
    clock.resume();
    driver.advance(0);
    assert.deepEqual(values, [1, 2]);
});

test("執行中加入已到期任務，在目前任務後於同一次喚醒執行", () => {
    const { clock, driver } = setup();
    const values: number[] = [];
    clock.schedule(1, () => {
        values.push(1);
        clock.scheduleAt(0, () => values.push(2), Phase.Combat);
        clock.schedule(0, () => values.push(3), Phase.Extraction);
        values.push(0);
    });
    clock.schedule(1, () => values.push(4));
    driver.advance(1);
    assert.deepEqual(values, [1, 0, 2, 3, 4]);
    assert.equal(driver.wakes, 1);
});

test("任務可取消同一次處理中尚未執行的任務", () => {
    const { clock, driver } = setup();
    const cancelled = clock.schedule(1, () => assert.fail("取消任務不可執行"));
    clock.schedule(1, () => cancelled.unsubscribe(), Phase.Combat);
    driver.advance(1);
    assert.equal(cancelled.closed, true);
});

test("任務錯誤透過設定回報，其他任務繼續執行", () => {
    const { clock, driver } = setup();
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    const expected = new Error("預期任務錯誤");
    let healthy = false;
    config.onUnhandledError = (error) => errors.push(error);
    try {
        clock.schedule(1, () => {
            throw expected;
        });
        clock.schedule(1, () => {
            healthy = true;
        });
        driver.advance(1);
        assert.deepEqual(errors, [expected]);
        assert.equal(healthy, true);
    } finally {
        config.onUnhandledError = saved;
    }
});

test("零秒自我排程在單次處理上限停止，保留未到期任務", () => {
    const { clock, driver } = setup();
    const saved = config.onUnhandledError;
    let errors = 0;
    let count = 0;
    let future = false;
    config.onUnhandledError = () => {
        errors++;
    };
    try {
        const loop = () => {
            count++;
            clock.schedule(0, loop);
        };
        clock.schedule(0, loop);
        clock.schedule(1, () => {
            future = true;
        });
        driver.advance(0);
        assert.equal(count, MAX_TASKS_PER_WAKE);
        assert.equal(errors, 1);
        assert.equal(clock.pendingCount(), 1);
        driver.advance(1);
        assert.equal(future, true);
        assert.equal(driver.isArmed(), false);
    } finally {
        config.onUnhandledError = saved;
    }
});

test("未安裝驅動器會明確報錯，安裝後可排程，重複安裝會報錯", () => {
    const clock = new Clock();
    assert.throws(() => clock.schedule(1, () => {}), /尚未安裝/);
    const driver = new FakeClockDriver();
    installClockDriver(clock, driver);
    assert.throws(() => installClockDriver(clock, driver), /已安裝/);
    let called = false;
    clock.schedule(1, () => {
        called = true;
    });
    driver.advance(1);
    assert.equal(called, true);
});

test("非法秒數會報錯，負數延遲視為零", () => {
    const { clock, driver } = setup();
    for (const time of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
        assert.throws(() => clock.schedule(time, () => {}), /有限秒數/);
    }
    let called = false;
    clock.schedule(-1, () => {
        called = true;
    });
    assert.equal(called, false);
    driver.advance(0);
    assert.equal(called, true);
});
