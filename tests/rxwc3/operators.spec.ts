import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    config,
    distinctUntilChanged,
    empty,
    filter,
    finalize,
    map,
    merge,
    mergeMap,
    never,
    Observable,
    of,
    scan,
    share,
    Subject,
    switchMap,
    take,
    takeUntil,
    takeWhile,
    tap,
} from "../../src/shared/rxwc3";

function collect<T>(source: Observable<T>): T[] {
    const values: T[] = [];
    source.subscribe((value) => values.push(value));
    return values;
}

test("map 使用每個訂閱的索引轉換值", () => {
    const mapped = of(2, 4).pipe(map((value, index) => value + index));
    assert.deepEqual(collect(mapped), [2, 5]);
    assert.deepEqual(collect(mapped), [2, 5]);
});

test("scan 從初始值累積，且每個訂閱有自己的狀態", () => {
    const scanned = of(1, 2, 3).pipe(
        scan((state, value: number, index) => state + value + index, 0),
    );
    assert.deepEqual(collect(scanned), [1, 4, 9]);
    assert.deepEqual(collect(scanned), [1, 4, 9]);
});

test("tap 執行回呼並保留值與完成通知", () => {
    const events: string[] = [];
    assert.deepEqual(
        collect(
            of(1, 2).pipe(
                tap({
                    next: (value) => events.push(String(value)),
                    complete: () => events.push("完成"),
                }),
            ),
        ),
        [1, 2],
    );
    assert.deepEqual(events, ["1", "2", "完成"]);
    let seen = 0;
    assert.deepEqual(
        collect(
            of(3).pipe(
                tap((value) => {
                    seen = value;
                }),
            ),
        ),
        [3],
    );
    assert.equal(seen, 3);
});

test("filter 依值與索引保留項目", () => {
    assert.deepEqual(
        collect(of(1, 2, 3, 4).pipe(filter((value, index) => value > 1 && index % 2 === 1))),
        [2, 4],
    );
});

test("take 到達數量後立即取消同步來源，零數量不啟動來源", () => {
    let sent = 0;
    let cleaned = 0;
    const source = new Observable<number>((subscriber) => {
        while (!subscriber.closed && sent < 5) {
            subscriber.next(++sent);
        }
        return () => cleaned++;
    });
    assert.deepEqual(collect(source.pipe(take(0))), []);
    assert.equal(sent, 0);
    assert.deepEqual(collect(source.pipe(take(2))), [1, 2]);
    assert.equal(sent, 2);
    assert.equal(cleaned, 1);
});

test("takeUntil 通知送出時完成，並清理來源與通知訂閱", () => {
    const source = new Subject<number>();
    const notifier = new Subject<number>();
    let sourceCleaned = 0;
    let notifierCleaned = 0;
    let completed = 0;
    const values: number[] = [];
    source
        .pipe(
            finalize(() => sourceCleaned++),
            takeUntil(notifier.pipe(finalize(() => notifierCleaned++))),
        )
        .subscribe({ next: (value) => values.push(value), complete: () => completed++ });
    source.next(1);
    notifier.next(0);
    source.next(2);
    assert.deepEqual(values, [1]);
    assert.equal(completed, 1);
    assert.equal(sourceCleaned, 1);
    assert.equal(notifierCleaned, 1);
});

test("takeUntil 同步通知可阻止來源啟動，通知完成不停止來源", () => {
    let started = 0;
    const source = new Observable<number>(() => {
        started++;
    });
    assert.equal(source.pipe(takeUntil(of(1))).subscribe().closed, true);
    assert.equal(started, 0);
    assert.deepEqual(collect(of(1, 2).pipe(takeUntil(empty()))), [1, 2]);
});

test("takeUntil 的通知錯誤會取消來源，手動取消也會清理通知", () => {
    const source = new Subject<number>();
    const notifier = new Subject<number>();
    let cleaned = 0;
    let received: unknown;
    const pipeline = source.pipe(takeUntil(notifier.pipe(finalize(() => cleaned++))));
    const first = pipeline.subscribe({
        error: (error) => {
            received = error;
        },
    });
    first.unsubscribe();
    assert.equal(cleaned, 1);
    const second = pipeline.subscribe({
        error: (error) => {
            received = error;
        },
    });
    notifier.error("通知錯誤");
    assert.equal(received, "通知錯誤");
    assert.equal(second.closed, true);
    assert.equal(cleaned, 2);
});

test("takeWhile 排除第一個不符合的值，並立即停止來源", () => {
    let visited = 0;
    const values = collect(
        of(1, 2, 3, 4).pipe(
            tap(() => visited++),
            takeWhile((value, index) => value < 3 && index < 2),
        ),
    );
    assert.deepEqual(values, [1, 2]);
    assert.equal(visited, 3);
});

test("distinctUntilChanged 只比較相鄰輸出，並支援自訂比較", () => {
    assert.deepEqual(collect(of(1, 1, 2, 2, 1).pipe(distinctUntilChanged())), [1, 2, 1]);
    assert.deepEqual(
        collect(of(1, 3, 2, 4, 1).pipe(distinctUntilChanged((a, b) => a % 2 === b % 2))),
        [1, 2, 1],
    );
});

test("merge 合併全部來源，並等待全部來源完成", () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const values: number[] = [];
    let completed = 0;
    merge(first, second).subscribe({
        next: (value) => values.push(value),
        complete: () => completed++,
    });
    first.next(1);
    second.next(2);
    first.complete();
    assert.equal(completed, 0);
    second.next(3);
    second.complete();
    assert.deepEqual(values, [1, 2, 3]);
    assert.equal(completed, 1);
    assert.equal(merge().subscribe().closed, true);
    assert.deepEqual(collect(merge(of(1), of(2))), [1, 2]);
});

test("merge 的錯誤取消其他來源，同步錯誤不啟動後續來源", () => {
    let cleaned = 0;
    let started = 0;
    let received: unknown;
    merge(
        never<number>().pipe(finalize(() => cleaned++)),
        new Observable<number>((subscriber) => subscriber.error("合併錯誤")),
    ).subscribe({
        error: (error) => {
            received = error;
        },
    });
    assert.equal(cleaned, 1);
    assert.equal(received, "合併錯誤");
    merge(
        new Observable<number>((subscriber) => subscriber.error("同步錯誤")),
        new Observable<number>(() => {
            started++;
        }),
    ).subscribe({ error: () => {} });
    assert.equal(started, 0);
});

test("mergeMap 保留全部內層，外層完成後等待內層完成", () => {
    const outer = new Subject<number>();
    const first = new Subject<number>();
    const second = new Subject<number>();
    const values: number[] = [];
    let completed = 0;
    outer
        .pipe(mergeMap((value) => (value === 1 ? first : second)))
        .subscribe({ next: (value) => values.push(value), complete: () => completed++ });
    outer.next(1);
    outer.next(2);
    first.next(10);
    second.next(20);
    outer.complete();
    first.complete();
    assert.equal(completed, 0);
    second.next(21);
    second.complete();
    assert.deepEqual(values, [10, 20, 21]);
    assert.equal(completed, 1);
    assert.deepEqual(collect(of(1, 2).pipe(mergeMap((value, index) => of(value + index)))), [1, 3]);
});

test("mergeMap 的內層錯誤與取消會清理其他內層", () => {
    const outer = new Subject<number>();
    const inner = new Subject<number>();
    let cleaned = 0;
    let received: unknown;
    const subscription = outer
        .pipe(mergeMap(() => inner.pipe(finalize(() => cleaned++))))
        .subscribe({
            error: (error) => {
                received = error;
            },
        });
    outer.next(1);
    outer.next(2);
    inner.error("內層錯誤");
    assert.equal(received, "內層錯誤");
    assert.equal(cleaned, 2);
    assert.equal(subscription.closed, true);
    const manual = of(1, 2)
        .pipe(mergeMap(() => never().pipe(finalize(() => cleaned++))))
        .subscribe();
    manual.unsubscribe();
    assert.equal(cleaned, 4);
});

test("switchMap 取消舊內層，並等待目前內層完成", () => {
    const outer = new Subject<number>();
    const first = new Subject<number>();
    const second = new Subject<number>();
    let cleaned = 0;
    let completed = 0;
    const values: number[] = [];
    outer
        .pipe(switchMap((value) => (value === 1 ? first : second).pipe(finalize(() => cleaned++))))
        .subscribe({ next: (value) => values.push(value), complete: () => completed++ });
    outer.next(1);
    first.next(10);
    outer.next(2);
    assert.equal(cleaned, 1);
    first.next(11);
    second.next(20);
    outer.complete();
    assert.equal(completed, 0);
    second.complete();
    assert.deepEqual(values, [10, 20]);
    assert.equal(completed, 1);
    assert.equal(cleaned, 2);
    assert.deepEqual(
        collect(of(1, 2).pipe(switchMap((value, index) => of(value + index)))),
        [1, 3],
    );
});

test("switchMap 取消訂閱與內層錯誤會清理目前內層", () => {
    const outer = new Subject<number>();
    const inner = new Subject<number>();
    let cleaned = 0;
    let received: unknown;
    const pipeline = outer.pipe(switchMap(() => inner.pipe(finalize(() => cleaned++))));
    const first = pipeline.subscribe();
    outer.next(1);
    first.unsubscribe();
    assert.equal(cleaned, 1);
    const second = pipeline.subscribe({
        error: (error) => {
            received = error;
        },
    });
    outer.next(2);
    inner.error("切換錯誤");
    assert.equal(received, "切換錯誤");
    assert.equal(second.closed, true);
    assert.equal(cleaned, 2);
});

test("share 依引用數共用來源，最後取消後可重新連接", () => {
    const source = new Subject<number>();
    let connections = 0;
    let cleaned = 0;
    const shared = new Observable<number>((subscriber) => {
        connections++;
        source.subscribe(subscriber);
        return () => cleaned++;
    }).pipe(share());
    const first: number[] = [];
    const second: number[] = [];
    const a = shared.subscribe((value) => first.push(value));
    const b = shared.subscribe((value) => second.push(value));
    assert.equal(connections, 1);
    source.next(1);
    a.unsubscribe();
    assert.equal(cleaned, 0);
    source.next(2);
    b.unsubscribe();
    assert.equal(cleaned, 1);
    const c = shared.subscribe();
    assert.equal(connections, 2);
    c.unsubscribe();
    assert.equal(cleaned, 2);
    assert.deepEqual(first, [1]);
    assert.deepEqual(second, [1, 2]);
});

test("share 在同步完成與錯誤後重設連接", () => {
    let connections = 0;
    let cleaned = 0;
    const shared = new Observable<number>((subscriber) => {
        subscriber.next(++connections);
        subscriber.complete();
        return () => cleaned++;
    }).pipe(share());
    assert.deepEqual(collect(shared), [1]);
    assert.deepEqual(collect(shared), [2]);
    assert.equal(cleaned, 2);
    let failures = 0;
    const failed = new Observable((subscriber) => subscriber.error(++failures)).pipe(share());
    const errors: unknown[] = [];
    failed.subscribe({ error: (error) => errors.push(error) });
    failed.subscribe({ error: (error) => errors.push(error) });
    assert.deepEqual(errors, [1, 2]);
});

test("share 的同步下游取消會立即停止來源", () => {
    let sent = 0;
    let cleaned = 0;
    const shared = new Observable<number>((subscriber) => {
        while (!subscriber.closed && sent < 5) {
            subscriber.next(++sent);
        }
        return () => cleaned++;
    }).pipe(share());
    assert.deepEqual(collect(shared.pipe(take(1))), [1]);
    assert.equal(sent, 1);
    assert.equal(cleaned, 1);
});

test("finalize 在完成、錯誤與手動取消時各執行一次", () => {
    let cleaned = 0;
    of(1)
        .pipe(finalize(() => cleaned++))
        .subscribe();
    new Observable((subscriber) => subscriber.error("來源錯誤"))
        .pipe(finalize(() => cleaned++))
        .subscribe({ error: () => {} });
    const subscription = never()
        .pipe(finalize(() => cleaned++))
        .subscribe();
    subscription.unsubscribe();
    subscription.unsubscribe();
    assert.equal(cleaned, 3);
});

test("finalize 的錯誤送到設定的處理器", () => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => errors.push(error);
    try {
        empty()
            .pipe(
                finalize(() => {
                    throw "清理錯誤";
                }),
            )
            .subscribe();
        assert.deepEqual(errors, ["清理錯誤"]);
    } finally {
        config.onUnhandledError = saved;
    }
});

const operators: { name: string; apply: (source: Observable<number>) => Observable<number> }[] = [
    { name: "map", apply: map((value: number) => value) },
    { name: "scan", apply: scan((state: number, value: number) => state + value, 0) },
    { name: "tap", apply: tap<number>(() => {}) },
    { name: "filter", apply: filter<number>(() => true) },
    { name: "take", apply: take<number>(10) },
    { name: "takeUntil", apply: takeUntil<number>(never()) },
    { name: "takeWhile", apply: takeWhile<number>(() => true) },
    { name: "distinctUntilChanged", apply: distinctUntilChanged<number>() },
    { name: "merge", apply: (source) => merge(source) },
    { name: "mergeMap", apply: mergeMap((value: number) => of(value)) },
    { name: "switchMap", apply: switchMap((value: number) => of(value)) },
    { name: "share", apply: share<number>() },
    { name: "finalize", apply: finalize<number>(() => {}) },
];

for (const operator of operators) {
    for (const terminal of ["完成", "錯誤", "取消"]) {
        test(`${operator.name} 傳遞${terminal}並清理上游`, () => {
            const input = new Subject<number>();
            let cleaned = 0;
            let completed = 0;
            const values: number[] = [];
            const errors: unknown[] = [];
            const subscription = operator.apply(input.pipe(finalize(() => cleaned++))).subscribe({
                next: (value) => values.push(value),
                error: (error) => errors.push(error),
                complete: () => completed++,
            });
            input.next(1);
            if (terminal === "完成") {
                input.complete();
            } else if (terminal === "錯誤") {
                input.error("上游錯誤");
            } else {
                subscription.unsubscribe();
            }
            input.next(2);
            assert.deepEqual(values, [1]);
            assert.equal(cleaned, 1);
            assert.equal(completed, terminal === "完成" ? 1 : 0);
            assert.deepEqual(errors, terminal === "錯誤" ? ["上游錯誤"] : []);
            assert.equal(subscription.closed, true);
        });
    }
}

const throwingOperators: {
    name: string;
    apply: (source: Observable<number>) => Observable<number>;
}[] = [
    {
        name: "map",
        apply: map<number, number>(() => {
            throw "回呼錯誤";
        }),
    },
    {
        name: "scan",
        apply: scan<number, number>(() => {
            throw "回呼錯誤";
        }, 0),
    },
    {
        name: "tap",
        apply: tap(() => {
            throw "回呼錯誤";
        }),
    },
    {
        name: "filter",
        apply: filter(() => {
            throw "回呼錯誤";
        }),
    },
    {
        name: "takeWhile",
        apply: takeWhile(() => {
            throw "回呼錯誤";
        }),
    },
    {
        name: "distinctUntilChanged",
        apply: distinctUntilChanged(() => {
            throw "回呼錯誤";
        }),
    },
    {
        name: "mergeMap",
        apply: mergeMap<number, number, "sync">(() => {
            throw "回呼錯誤";
        }),
    },
    {
        name: "switchMap",
        apply: switchMap<number, number, "sync">(() => {
            throw "回呼錯誤";
        }),
    },
];

for (const operator of throwingOperators) {
    test(`${operator.name} 將回呼錯誤送到下游並停止來源`, () => {
        let visited = 0;
        let received: unknown;
        let cleaned = 0;
        const subscription = operator
            .apply(
                of(1, 2, 3).pipe(
                    tap(() => visited++),
                    finalize(() => cleaned++),
                ),
            )
            .subscribe({
                error: (error) => {
                    received = error;
                },
            });
        assert.equal(received, "回呼錯誤");
        assert.equal(subscription.closed, true);
        assert.equal(visited, operator.name === "distinctUntilChanged" ? 2 : 1);
        assert.equal(cleaned, 1);
    });
}

test("tap 的完成與錯誤回呼拋出錯誤時，下游收到新錯誤", () => {
    const errors: unknown[] = [];
    empty()
        .pipe(
            tap({
                complete: () => {
                    throw "完成回呼錯誤";
                },
            }),
        )
        .subscribe({ error: (error) => errors.push(error) });
    new Observable((subscriber) => subscriber.error("來源錯誤"))
        .pipe(
            tap({
                error: () => {
                    throw "錯誤回呼錯誤";
                },
            }),
        )
        .subscribe({ error: (error) => errors.push(error) });
    assert.deepEqual(errors, ["完成回呼錯誤", "錯誤回呼錯誤"]);
});

test("mergeMap 的轉換回呼完成外層時，仍等待目前內層", () => {
    const outer = new Subject<number>();
    const inner = new Subject<number>();
    const values: number[] = [];
    let completed = false;
    outer
        .pipe(
            mergeMap(() => {
                outer.complete();
                return inner;
            }),
        )
        .subscribe({
            next: (value) => values.push(value),
            complete: () => {
                completed = true;
            },
        });
    outer.next(1);
    assert.equal(completed, false);
    inner.next(2);
    inner.complete();
    assert.deepEqual(values, [2]);
    assert.equal(completed, true);
});

test("switchMap 清理舊內層時再次送出外層值，只保留最新內層", () => {
    const outer = new Subject<number>();
    const inner = new Subject<number>();
    const starts: number[] = [];
    const values: number[] = [];
    outer
        .pipe(
            switchMap((value) => {
                starts.push(value);
                return inner.pipe(
                    map((item) => item + value),
                    finalize(() => {
                        if (value === 1) {
                            outer.next(3);
                        }
                    }),
                );
            }),
        )
        .subscribe((value) => values.push(value));
    outer.next(1);
    outer.next(2);
    inner.next(10);
    assert.deepEqual(starts, [1, 3]);
    assert.deepEqual(values, [13]);
});

test("switchMap 的轉換回呼再次送出外層值，較早的內層不會啟動", () => {
    const outer = new Subject<number>();
    const values: number[] = [];
    outer
        .pipe(
            switchMap((value) => {
                if (value === 1) {
                    outer.next(2);
                }
                return of(value);
            }),
        )
        .subscribe((value) => values.push(value));
    outer.next(1);
    assert.deepEqual(values, [2]);
});

test("switchMap 的轉換回呼完成外層時，仍等待目前內層", () => {
    const outer = new Subject<number>();
    const inner = new Subject<number>();
    const values: number[] = [];
    let completed = false;
    outer
        .pipe(
            switchMap(() => {
                outer.complete();
                return inner;
            }),
        )
        .subscribe({
            next: (value) => values.push(value),
            complete: () => {
                completed = true;
            },
        });
    outer.next(1);
    assert.equal(completed, false);
    inner.next(2);
    inner.complete();
    assert.deepEqual(values, [2]);
    assert.equal(completed, true);
});

test("share 完成回呼中的再次訂閱使用新連接", () => {
    let connections = 0;
    let cleaned = 0;
    const shared = new Observable<number>((subscriber) => {
        subscriber.next(++connections);
        subscriber.complete();
        return () => cleaned++;
    }).pipe(share());
    const values: number[] = [];
    shared.subscribe({
        next: (value) => values.push(value),
        complete: () => shared.subscribe((value) => values.push(value)),
    });
    assert.deepEqual(values, [1, 2]);
    assert.equal(cleaned, 2);
});
