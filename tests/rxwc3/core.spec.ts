import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    BehaviorSubject,
    config,
    empty,
    from,
    map,
    never,
    Observable,
    of,
    pipe,
    Subject,
    Subscriber,
    Subscription,
    take,
} from "../../src/shared/rxwc3";

test("Subscription 收集清理，並立即清理加入已關閉訂閱的項目", () => {
    const calls: number[] = [];
    const parent = new Subscription(() => calls.push(1));
    const child = new Subscription(() => calls.push(2));
    parent.add(parent);
    parent.add(undefined);
    parent.add(child);
    parent.add(child);
    parent.unsubscribe();
    parent.unsubscribe();
    parent.add(() => calls.push(3));
    assert.deepEqual(calls, [1, 2, 3]);
    assert.equal(child.closed, true);
});

test("Subscription 移除子訂閱，且清理錯誤不會停止後續清理", () => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => errors.push(error);
    try {
        const parent = new Subscription();
        const child = new Subscription();
        parent.add(child);
        parent.remove(child);
        parent.add(() => {
            throw "清理錯誤";
        });
        let cleaned = false;
        parent.add(() => {
            cleaned = true;
        });
        parent.unsubscribe();
        assert.equal(child.closed, false);
        assert.equal(cleaned, true);
        assert.deepEqual(errors, ["清理錯誤"]);
        child.unsubscribe();
    } finally {
        config.onUnhandledError = saved;
    }
});

test("Observable 完成後停止送出，並清理同步訂閱回傳的資源", () => {
    const events: string[] = [];
    const source = new Observable<number>((subscriber) => {
        subscriber.next(1);
        subscriber.complete();
        subscriber.next(2);
        subscriber.error("晚到錯誤");
        return () => events.push("清理");
    });
    const subscription = source.subscribe({
        next: (value) => events.push(String(value)),
        complete: () => events.push("完成"),
        error: () => assert.fail("不應收到晚到錯誤"),
    });
    assert.deepEqual(events, ["1", "完成", "清理"]);
    assert.equal(subscription.closed, true);
});

test("Observable 把建立來源時的錯誤送到錯誤回呼", () => {
    const failure = new Error("來源錯誤");
    let received: unknown;
    const subscription = new Observable(() => {
        throw failure;
    }).subscribe({
        error: (error) => {
            received = error;
        },
    });
    assert.equal(received, failure);
    assert.equal(subscription.closed, true);
});

test("已關閉的 Subscriber 不會啟動來源", () => {
    let started = false;
    const subscriber = new Subscriber<number>();
    subscriber.unsubscribe();
    new Observable<number>(() => {
        started = true;
    }).subscribe(subscriber);
    assert.equal(started, false);
});

test("一般來源支援陣列、Observable、空值序列與永不完成的序列", () => {
    const values: number[] = [];
    let completed = 0;
    const source = of(1, 2);
    assert.equal(from(source), source);
    from([3, 4]).subscribe((value) => values.push(value));
    source.subscribe((value) => values.push(value));
    empty().subscribe({ complete: () => completed++ });
    of().subscribe({ complete: () => completed++ });
    const pending = never().subscribe({ complete: () => assert.fail("不應完成") });
    assert.deepEqual(values, [3, 4, 1, 2]);
    assert.equal(completed, 2);
    assert.equal(pending.closed, false);
    pending.unsubscribe();
});

test("陣列來源在下游完成時停止讀取", () => {
    let reads = 0;
    const values = [1, 2, 3];
    Object.defineProperty(values, 1, {
        get: () => {
            reads++;
            return 2;
        },
    });
    from(values).pipe(take(1)).subscribe();
    assert.equal(reads, 0);
});

test("pipe 依序組合函式，且空 pipe 保留輸入", () => {
    assert.equal(pipe<number>()(3), 3);
    assert.equal(
        pipe(
            (value: number) => value + 1,
            (value) => String(value),
        )(3),
        "4",
    );
    const source = of(2);
    assert.equal(source.pipe(), source);
    const values: number[] = [];
    source.pipe(map((value) => value * 3)).subscribe((value) => values.push(value));
    assert.deepEqual(values, [6]);
});

test("Subject 分發中取消自己與後續訂閱者，不漏掉其他訂閱者", () => {
    const subject = new Subject<number>();
    const events: string[] = [];
    const first = subject.subscribe((value) => {
        events.push(`甲${value}`);
        first.unsubscribe();
        second.unsubscribe();
    });
    const second = subject.subscribe((value) => events.push(`乙${value}`));
    subject.subscribe((value) => events.push(`丙${value}`));
    subject.next(1);
    subject.next(2);
    assert.deepEqual(events, ["甲1", "丙1", "丙2"]);
});

test("Subject 分發中加入的訂閱者從下一次分發開始接收", () => {
    const subject = new Subject<number>();
    const events: string[] = [];
    subject.subscribe((value) => {
        events.push(`甲${value}`);
        if (value === 1) {
            subject.subscribe((item) => events.push(`乙${item}`));
        }
    });
    subject.next(1);
    subject.next(2);
    assert.deepEqual(events, ["甲1", "甲2", "乙2"]);
});

test("Subject 巢狀分發期間維持訂閱順序與取消狀態", () => {
    const subject = new Subject<number>();
    const events: string[] = [];
    subject.subscribe((value) => {
        events.push(`甲${value}`);
        if (value === 1) {
            second.unsubscribe();
            subject.subscribe((item) => events.push(`丁${item}`));
            subject.next(2);
        }
    });
    const second = subject.subscribe((value) => events.push(`乙${value}`));
    subject.subscribe((value) => events.push(`丙${value}`));
    subject.next(1);
    subject.next(3);
    assert.deepEqual(events, ["甲1", "甲2", "丙2", "丁2", "丙1", "甲3", "丙3", "丁3"]);
});

test("Subject 訂閱者拋出錯誤後，其他訂閱者仍接收值", () => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => errors.push(error);
    try {
        const subject = new Subject<number>();
        const values: number[] = [];
        subject.subscribe(() => {
            throw "訂閱者錯誤";
        });
        subject.subscribe((value) => values.push(value));
        subject.next(1);
        subject.next(2);
        assert.deepEqual(values, [1, 2]);
        assert.deepEqual(errors, ["訂閱者錯誤", "訂閱者錯誤"]);
    } finally {
        config.onUnhandledError = saved;
    }
});

for (const terminal of ["完成", "錯誤"]) {
    test(`Subject ${terminal}回呼錯誤不會中斷分發，晚訂閱者收到終止通知`, () => {
        const saved = config.onUnhandledError;
        const errors: unknown[] = [];
        config.onUnhandledError = (error) => errors.push(error);
        try {
            const subject = new Subject<number>();
            const events: string[] = [];
            subject.subscribe({
                complete: () => {
                    throw "回呼錯誤";
                },
                error: () => {
                    throw "回呼錯誤";
                },
            });
            const observer = {
                next: () => assert.fail("不應收到值"),
                complete: () => events.push("完成"),
                error: (error: unknown) => events.push(String(error)),
            };
            subject.subscribe(observer);
            if (terminal === "完成") {
                subject.complete();
            } else {
                subject.error("錯誤");
            }
            subject.next(1);
            subject.subscribe(observer);
            assert.deepEqual(events, [terminal, terminal]);
            assert.deepEqual(errors, ["回呼錯誤"]);
        } finally {
            config.onUnhandledError = saved;
        }
    });
}

test("預設錯誤處理可在 Node 使用，也可使用 Lua 的 print", (t) => {
    const errors: unknown[] = [];
    t.mock.method(console, "error", (error: unknown) => errors.push(error));
    const failure = new Error("未處理錯誤");
    new Observable((subscriber) => subscriber.error(failure)).subscribe();
    assert.deepEqual(errors, [failure.stack]);
    const runtime = globalThis as unknown as { print?: (value: unknown) => void };
    const savedPrint = runtime.print;
    const printed: unknown[] = [];
    runtime.print = (value) => printed.push(value);
    try {
        config.onUnhandledError(failure);
        assert.deepEqual(printed, [failure.stack]);
    } finally {
        if (savedPrint === undefined) {
            delete runtime.print;
        } else {
            runtime.print = savedPrint;
        }
    }
});

test("自訂錯誤處理拋出錯誤時，Subject 仍完成分發", (t) => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    t.mock.method(console, "error", (error: unknown) => errors.push(error));
    config.onUnhandledError = () => {
        throw "處理器錯誤";
    };
    try {
        const subject = new Subject<number>();
        const values: number[] = [];
        subject.subscribe(() => {
            throw "訂閱者錯誤";
        });
        subject.subscribe((value) => values.push(value));
        subject.next(1);
        assert.deepEqual(values, [1]);
        assert.deepEqual(errors, ["處理器錯誤"]);
    } finally {
        config.onUnhandledError = saved;
    }
});

test("BehaviorSubject 立即送出目前值，並保留最新值", () => {
    const subject = new BehaviorSubject(1);
    const first: number[] = [];
    const second: number[] = [];
    subject.subscribe((value) => first.push(value));
    subject.next(2);
    subject.subscribe((value) => second.push(value));
    assert.equal(subject.getValue(), 2);
    subject.complete();
    const late: number[] = [];
    let completed = false;
    subject.subscribe({
        next: (value) => late.push(value),
        complete: () => {
            completed = true;
        },
    });
    assert.deepEqual(first, [1, 2]);
    assert.deepEqual(second, [2]);
    assert.deepEqual(late, []);
    assert.equal(completed, true);
});

test("BehaviorSubject 的錯誤傳給晚訂閱者，且 getValue 拋出相同錯誤", () => {
    const subject = new BehaviorSubject(1);
    const failure = new Error("狀態錯誤");
    subject.error(failure);
    let received: unknown;
    subject.subscribe({
        error: (error) => {
            received = error;
        },
    });
    assert.equal(received, failure);
    assert.throws(
        () => subject.getValue(),
        (error) => error === failure,
    );
});

test("BehaviorSubject 的同步初始值可以觸發取消", () => {
    const subject = new BehaviorSubject(1);
    const values: number[] = [];
    const subscription = subject.pipe(take(1)).subscribe((value) => values.push(value));
    subject.next(2);
    assert.equal(subscription.closed, true);
    assert.deepEqual(values, [1]);
});

test("Subject 隔離自訂 Subscriber 的錯誤", () => {
    class FailingSubscriber extends Subscriber<number> {
        public next(value: number): void {
            throw "自訂訂閱者錯誤";
        }
    }
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => errors.push(error);
    try {
        const subject = new Subject<number>();
        const values: number[] = [];
        subject.subscribe(new FailingSubscriber());
        subject.subscribe((value) => values.push(value));
        subject.next(1);
        assert.deepEqual(values, [1]);
        assert.deepEqual(errors, ["自訂訂閱者錯誤"]);
    } finally {
        config.onUnhandledError = saved;
    }
});
