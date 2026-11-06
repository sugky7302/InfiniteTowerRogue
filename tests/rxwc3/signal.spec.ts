import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    batch,
    computed,
    config,
    effect,
    linkedSignal,
    localComputed,
    localEffect,
    localLinkedSignal,
    localSignal,
    Local,
    Observable,
    of,
    signal,
    Signal,
    Subject,
    Subscription,
    take,
    toObservable,
    toSignal,
    untracked,
} from "../../src/shared/lib/rxwc3";

function captureErrors(fn: (errors: unknown[]) => void): void {
    const saved = config.onUnhandledError;
    const savedCheck = config.checkSignalSync;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    try {
        fn(errors);
    } finally {
        config.onUnhandledError = saved;
        config.checkSignalSync = savedCheck;
    }
}

test("Signal 支援讀取、寫入、更新與真正的唯讀外觀", () => {
    const value = signal(1);
    const readonly = value.asReadOnly();
    assert.equal(value(), 1);
    assert.equal(value.asReadOnly(), readonly);
    assert.equal("set" in readonly, false);
    assert.equal("update" in readonly, false);
    value.set(2);
    value.update((previous) => previous + 3);
    assert.equal(readonly(), 5);
});

test("Effect 建立後立即執行，每次寫入後同步執行", () => {
    const value = signal(0);
    const values: number[] = [];
    const ref = effect(() => {
        values.push(value());
    });
    assert.deepEqual(values, [0]);
    value.set(1);
    assert.deepEqual(values, [0, 1]);
    value.update((previous) => previous + 1);
    assert.deepEqual(values, [0, 1, 2]);
    ref.destroy();
});

test("Signal 預設使用嚴格相等，自訂比較可阻止通知", () => {
    const object = { value: 1 };
    const source = signal(object);
    const custom = signal({ value: 1 }, { equal: (a, b) => a.value === b.value });
    let runs = 0;
    const ref = effect(() => {
        source();
        custom();
        runs++;
    });
    source.set(object);
    custom.set({ value: 1 });
    assert.equal(runs, 1);
    source.set({ value: 1 });
    custom.set({ value: 2 });
    assert.equal(runs, 3);
    ref.destroy();
});

test("computed 延遲計算並快取，未讀取時不重新計算", () => {
    const source = signal(1);
    let calls = 0;
    const derived = computed(() => {
        calls++;
        return source() * 2;
    });
    assert.equal(calls, 0);
    assert.equal(derived(), 2);
    assert.equal(derived(), 2);
    assert.equal(calls, 1);
    source.set(2);
    source.set(3);
    assert.equal(calls, 1);
    assert.equal(derived(), 6);
    assert.equal(calls, 2);
});

test("computed 的相等結果不執行下游計算或副作用", () => {
    const source = signal(1);
    const parity = computed(() => source() % 2);
    let calculations = 0;
    const derived = computed(() => {
        calculations++;
        return parity() + 10;
    });
    const values: number[] = [];
    const ref = effect(() => {
        values.push(derived());
    });
    source.set(3);
    assert.equal(calculations, 1);
    assert.deepEqual(values, [11]);
    source.set(4);
    assert.equal(calculations, 2);
    assert.deepEqual(values, [11, 10]);
    ref.destroy();
});

test("computed 自訂比較保留舊值與下游版本", () => {
    const source = signal(1);
    const derived = computed(() => ({ parity: source() % 2 }), {
        equal: (a, b) => a.parity === b.parity,
    });
    const first = derived();
    let runs = 0;
    const ref = effect(() => {
        derived();
        runs++;
    });
    source.set(3);
    assert.equal(derived(), first);
    assert.equal(runs, 1);
    source.set(2);
    assert.equal(runs, 2);
    ref.destroy();
});

test("菱形依賴只執行一次副作用，且不讀到中間值", () => {
    const a = signal(1);
    const b = computed(() => a() * 2);
    const c = computed(() => a() * 3);
    const d = computed(() => b() + c());
    const values: number[][] = [];
    const ref = effect(() => {
        values.push([b(), c(), d(), a()]);
    });
    a.set(2);
    assert.deepEqual(values, [
        [2, 3, 5, 1],
        [4, 6, 10, 2],
    ]);
    ref.destroy();
});

test("巢狀 batch 只在最外層結束時執行副作用", () => {
    const a = signal(1);
    const b = signal(2);
    const sum = computed(() => a() + b());
    const values: number[] = [];
    const ref = effect(() => {
        values.push(sum());
    });
    const result = batch(() => {
        a.set(3);
        batch(() => {
            b.set(4);
        });
        assert.deepEqual(values, [3]);
        assert.equal(sum(), 7);
        a.set(5);
        return 42;
    });
    assert.equal(result, 42);
    assert.deepEqual(values, [3, 9]);
    ref.destroy();
});

test("batch 拋出錯誤後仍執行副作用並恢復狀態", () => {
    const source = signal(0);
    const values: number[] = [];
    const ref = effect(() => {
        values.push(source());
    });
    assert.throws(
        () =>
            batch(() => {
                source.set(1);
                throw new Error("批次錯誤");
            }),
        /批次錯誤/,
    );
    source.set(2);
    assert.deepEqual(values, [0, 1, 2]);
    ref.destroy();
});

test("computed 每次重建動態依賴，即使結果相同也移除舊來源", () => {
    const choose = signal(true);
    const a = signal(1);
    const b = signal(1);
    let calculations = 0;
    const derived = computed(() => {
        calculations++;
        return choose() ? a() : b();
    });
    const values: number[] = [];
    const ref = effect(() => {
        values.push(derived());
    });
    choose.set(false);
    a.set(2);
    assert.equal(calculations, 2);
    assert.deepEqual(values, [1]);
    b.set(3);
    assert.deepEqual(values, [1, 3]);
    ref.destroy();
});

test("effect 重建動態依賴", () => {
    const choose = signal(true);
    const a = signal(1);
    const b = signal(2);
    const values: number[] = [];
    const ref = effect(() => {
        values.push(choose() ? a() : b());
    });
    choose.set(false);
    a.set(3);
    b.set(4);
    assert.deepEqual(values, [1, 2, 4]);
    ref.destroy();
});

test("untracked 的讀取不建立依賴，拋出錯誤後仍恢復追蹤", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    const ref = effect(() => {
        runs++;
        assert.throws(() =>
            untracked(() => {
                b();
                throw new Error("未追蹤錯誤");
            }),
        );
        a();
    });
    b.set(3);
    assert.equal(runs, 1);
    a.set(2);
    assert.equal(runs, 2);
    ref.destroy();
});

test("update 回呼的讀取不建立副作用依賴", () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    const ref = effect(() => {
        runs++;
        a.update(() => b());
    });
    b.set(3);
    assert.equal(runs, 1);
    ref.destroy();
});

test("Effect 可以寫入 Signal，後續副作用同步取得最新值", () => {
    const a = signal(0);
    const b = signal(0);
    const writer = effect(() => {
        b.set(a() * 2);
    });
    const values: number[] = [];
    const reader = effect(() => {
        values.push(b());
    });
    a.set(3);
    assert.deepEqual(values, [0, 6]);
    writer.destroy();
    reader.destroy();
});

test("同一輪副作用達到 100 次後停止循環並報告錯誤", () =>
    captureErrors((errors) => {
        const source = signal(0);
        let runs = 0;
        const ref = effect(() => {
            runs++;
            source.set(source() + 1);
        });
        assert.equal(runs, 100);
        assert.equal(ref.closed, true);
        assert.equal(errors.length, 1);
        assert.match(String(errors[0]), /100/);
        source.set(0);
        assert.equal(runs, 100);
    }));

test("超過 100 個獨立副作用可在同一輪正常執行", () =>
    captureErrors((errors) => {
        const source = signal(0);
        let runs = 0;
        const refs = Array.from({ length: 105 }, () =>
            effect(() => {
                source();
                runs++;
            }),
        );
        source.set(1);
        assert.equal(runs, 210);
        assert.deepEqual(errors, []);
        refs.forEach((ref) => ref.destroy());
    }));

test("相等結果略過的副作用不計入循環上限", () =>
    captureErrors((errors) => {
        const source = signal(0);
        const parity = computed(() => source() % 2);
        let runs = 0;
        const stable = effect(() => {
            parity();
            runs++;
        });
        const a = signal(0);
        const b = signal(0);
        const first = effect(() => {
            const value = a();
            if (value > 0 && value < 100) {
                source.update((previous) => previous + 2);
                b.set(value);
            }
        });
        const second = effect(() => {
            const value = b();
            if (value > 0 && value < 100) {
                source.update((previous) => previous + 2);
                a.set(value + 1);
            }
        });
        a.set(1);
        assert.equal(a(), 100);
        assert.equal(runs, 1);
        assert.equal(stable.closed, false);
        assert.deepEqual(errors, []);
        stable.destroy();
        first.destroy();
        second.destroy();
    }));

test("computed 內的 set 與 update 被拒絕，untracked 不能繞過限制", () =>
    captureErrors((errors) => {
        const source = signal(1);
        let updates = 0;
        const derived = computed(() => {
            source.set(2);
            untracked(() =>
                source.update((value) => {
                    updates++;
                    return value + 1;
                }),
            );
            return source();
        });
        assert.equal(derived(), 1);
        assert.equal(source(), 1);
        assert.equal(updates, 0);
        assert.equal(errors.length, 2);
    }));

test("Effect 重跑前與銷毀時各執行清理，且可加入 Subscription", () => {
    const source = signal(1);
    const events: string[] = [];
    const owner = new Subscription();
    const ref = effect((onCleanup) => {
        const value = source();
        events.push(`執行${value}`);
        onCleanup(() => {
            events.push(`清理${value}`);
        });
    });
    owner.add(ref);
    source.set(2);
    owner.unsubscribe();
    ref.destroy();
    source.set(3);
    assert.deepEqual(events, ["執行1", "清理1", "執行2", "清理2"]);
    assert.equal(ref.closed, true);
});

test("清理錯誤不阻止其他清理，清理的讀取不建立依賴", () =>
    captureErrors((errors) => {
        const source = signal(0);
        const other = signal(0);
        let runs = 0;
        let cleaned = 0;
        const ref = effect((onCleanup) => {
            source();
            runs++;
            onCleanup(() => {
                other();
                throw new Error("清理錯誤");
            });
            onCleanup(() => {
                cleaned++;
            });
        });
        source.set(1);
        other.set(1);
        assert.equal(runs, 2);
        ref.destroy();
        assert.equal(cleaned, 2);
        assert.equal(errors.length, 2);
    }));

test("Effect 錯誤經由設定報告，其他副作用繼續執行", () =>
    captureErrors((errors) => {
        const source = signal(0);
        const bad = effect(() => {
            source();
            throw new Error("副作用錯誤");
        });
        const values: number[] = [];
        const good = effect(() => {
            values.push(source());
        });
        source.set(1);
        assert.equal(errors.length, 2);
        assert.deepEqual(values, [0, 1]);
        bad.destroy();
        good.destroy();
    }));

test("computed 錯誤不阻止其他副作用，來源恢復後可重新計算", () =>
    captureErrors((errors) => {
        const source = signal(0);
        const derived = computed(() => {
            const value = source();
            if (value === 1) throw new Error("計算錯誤");
            return value;
        });
        const values: number[] = [];
        const ref = effect(() => {
            values.push(derived());
        });
        let otherRuns = 0;
        const other = effect(() => {
            source();
            otherRuns++;
        });
        source.set(1);
        source.set(2);
        assert.deepEqual(values, [0, 2]);
        assert.equal(errors.length, 1);
        assert.equal(otherRuns, 3);
        ref.destroy();
        other.destroy();
    }));

test("批次內建立 Effect 仍立即執行，銷毀已排隊的 Effect 可阻止重跑", () => {
    const source = signal(0);
    let runs = 0;
    batch(() => {
        const ref = effect(() => {
            source();
            runs++;
        });
        assert.equal(runs, 1);
        source.set(1);
        ref.destroy();
    });
    assert.equal(runs, 1);
});

test("linkedSignal 簡式支援手動寫入，來源改變後重設", () => {
    const source = signal(1);
    const linked = linkedSignal(() => source() * 2);
    const readonly = linked.asReadOnly();
    assert.equal(linked(), 2);
    linked.set(10);
    linked.update((value) => value + 1);
    assert.equal(readonly(), 11);
    source.set(2);
    assert.equal(linked(), 4);
    assert.equal("set" in readonly, false);
});

test("linkedSignal 完整形式收到來源、上一次來源與目前手動值", () => {
    const source = signal(1);
    const previous: unknown[] = [];
    const linked = linkedSignal({
        source,
        computation: (value, last) => {
            previous.push(last);
            return value * 2;
        },
    });
    assert.equal(linked(), 2);
    linked.set(9);
    source.set(2);
    assert.equal(linked(), 4);
    assert.deepEqual(previous, [undefined, { source: 1, value: 9 }]);
});

test("linkedSignal 可直接接受可呼叫的 Signal，並支援自訂相等比較", () => {
    const source = signal(1);
    const linked = linkedSignal(source, { equal: (a, b) => a % 2 === b % 2 });
    const values: number[] = [];
    const ref = effect(() => {
        values.push(linked());
    });
    source.set(3);
    linked.set(5);
    assert.deepEqual(values, [1]);
    source.set(4);
    assert.deepEqual(values, [1, 4]);
    ref.destroy();
});

test("linkedSignal 重建動態依賴，批次寫入後只通知一次", () => {
    const choose = signal(true);
    const a = signal(1);
    const b = signal(2);
    const linked = linkedSignal(() => (choose() ? a() : b()));
    const values: number[] = [];
    const ref = effect(() => {
        values.push(linked());
    });
    choose.set(false);
    a.set(3);
    batch(() => {
        linked.set(9);
        b.set(4);
    });
    assert.deepEqual(values, [1, 2, 4]);
    ref.destroy();
});

test("本地的四種 API 保留標記並允許讀取同步與本地值", () =>
    captureErrors((errors) => {
        const a = localSignal(1);
        const b = signal(2);
        const derived = localComputed(() => a() + b());
        const linked = localLinkedSignal(() => derived());
        const complete = localLinkedSignal({ source: a, computation: (value) => value * 2 });
        const values: number[] = [];
        const ref = localEffect(() => {
            values.push(linked() + complete());
        });
        a.set(2);
        assert.deepEqual(values, [5, 8]);
        assert.equal(a.asReadOnly().syncKind, "local");
        assert.equal(derived.syncKind, "local");
        assert.equal(linked.syncKind, "local");
        assert.deepEqual(errors, []);
        ref.destroy();
    }));

for (const mode of ["計算", "連結簡式", "連結完整形式", "副作用"]) {
    test(`同步${mode}讀取本地 Signal 時報告錯誤`, () =>
        captureErrors((errors) => {
            const local = localSignal(1);
            if (mode === "計算") computed(() => local())();
            else if (mode === "連結簡式") linkedSignal(() => local())();
            else if (mode === "連結完整形式")
                linkedSignal({ source: local, computation: (value) => value })();
            else
                effect(() => {
                    local();
                }).destroy();
            assert.equal(errors.length, 1);
            assert.match(String(errors[0]), /本地/);
        }));
}

test("checkSignalSync 預設啟用，關閉後不檢查本地讀取", () =>
    captureErrors((errors) => {
        assert.equal(config.checkSignalSync, true);
        config.checkSignalSync = false;
        const local = localSignal(1);
        const a = computed(() => local());
        const b = linkedSignal(() => local());
        const c = linkedSignal({ source: local, computation: (value) => value });
        const ref = effect(() => {
            a();
            b();
            c();
            local();
        });
        local.set(2);
        assert.deepEqual(errors, []);
        ref.destroy();
    }));

test("untracked 只停止依賴追蹤，不能繞過同步性檢查", () =>
    captureErrors((errors) => {
        const local = localSignal(1);
        computed(() => untracked(local))();
        linkedSignal(() => untracked(local))();
        const ref = effect(() => {
            untracked(local);
        });
        assert.equal(errors.length, 3);
        local.set(2);
        assert.equal(errors.length, 3);
        ref.destroy();
    }));

test("toSignal 訂閱來源、保留目前值，owner 結束時取消訂閱", () => {
    const source = new Subject<number>();
    const owner = new Subscription();
    const target = toSignal(source, 0, { owner });
    assert.equal(target(), 0);
    source.next(1);
    assert.equal(target(), 1);
    owner.unsubscribe();
    source.next(2);
    assert.equal(target(), 1);
    assert.equal("set" in target, false);
    assert.equal(toSignal(of(3, 4), 0)(), 4);
});

test("toSignal 的 owner 已結束時不啟動來源，同步送出時也可取消", () => {
    const owner = new Subscription();
    owner.unsubscribe();
    let starts = 0;
    const source = new Observable<number>(() => {
        starts++;
    });
    toSignal(source, 0, { owner });
    assert.equal(starts, 0);
    const liveOwner = new Subscription();
    let sends = 0;
    toSignal(
        new Observable<number>((subscriber) => {
            while (!subscriber.closed && sends < 3) {
                subscriber.next(++sends);
                liveOwner.unsubscribe();
            }
        }),
        0,
        { owner: liveOwner },
    );
    assert.equal(sends, 1);
});

test("toSignal 來源錯誤經由設定報告，來源完成後保留最後值", () =>
    captureErrors((errors) => {
        const source = new Subject<number>();
        const target = toSignal(source, 0);
        source.next(2);
        source.error("串流錯誤");
        assert.equal(target(), 2);
        assert.deepEqual(errors, ["串流錯誤"]);
        assert.equal(toSignal(of(1), 0)(), 1);
    }));

test("toObservable 立即送出目前值，之後送出變更，取消時移除副作用", () => {
    const source = signal(0);
    let calculations = 0;
    const derived = computed(() => {
        calculations++;
        return source();
    });
    const values: number[] = [];
    const observable = toObservable(derived);
    const subscription = observable.subscribe((value) => {
        values.push(value);
    });
    source.set(1);
    source.set(1);
    batch(() => {
        source.set(2);
        source.set(3);
    });
    subscription.unsubscribe();
    source.set(4);
    assert.deepEqual(values, [0, 1, 3]);
    assert.equal(calculations, 3);
    const second: number[] = [];
    observable.pipe(take(1)).subscribe((value) => {
        second.push(value);
    });
    source.set(5);
    assert.deepEqual(second, [4]);
    assert.equal(calculations, 4);
});

test("toObservable 在批次內訂閱也立即送出目前值，訂閱者讀取不建立依賴", () => {
    const source = signal(0);
    const other = signal(0);
    const values: number[] = [];
    let subscription: Subscription | undefined;
    batch(() => {
        source.set(1);
        subscription = toObservable(source).subscribe((value) => {
            other();
            values.push(value);
        });
        assert.deepEqual(values, [1]);
        source.set(2);
    });
    other.set(1);
    assert.deepEqual(values, [1, 2]);
    subscription!.unsubscribe();
});

test("串流互通保留本地標記，一般本地串流可明確提供執行時標記", () =>
    captureErrors((errors) => {
        const local = localSignal(1);
        const owner = new Subscription();
        const roundtrip = toSignal(toObservable(local), 0, { owner });
        assert.equal(roundtrip.syncKind, "local");
        const external = new Subject<number, Local>();
        const target = toSignal(external, 0, { owner, syncKind: "local" });
        assert.equal(target.syncKind, "local");
        computed(() => target())();
        assert.equal(errors.length, 1);
        owner.unsubscribe();
    }));

test("computed 循環依賴會報錯，不會無限遞迴", () => {
    let a: Signal<number>;
    const b = computed(() => a());
    a = computed(() => b());
    assert.throws(() => a(), /循環/);
});
