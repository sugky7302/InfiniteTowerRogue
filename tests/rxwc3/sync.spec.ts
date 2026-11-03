import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
    computed,
    config,
    debounceTime,
    delay,
    distinctUntilChanged,
    effect,
    filter,
    finalize,
    forLocalPlayer,
    linkedSignal,
    Local,
    localComputed,
    localEffect,
    localLinkedSignal,
    localSignal,
    map,
    merge,
    mergeMap,
    Observable,
    of,
    OperatorFunction,
    pipe,
    scan,
    share,
    Subject,
    Subscription,
    sync,
    switchMap,
    take,
    takeUntil,
    takeWhile,
    tap,
    throttleTime,
    toObservable,
    toSignal,
} from "../../src/shared/rxwc3";
import { wc3SyncNatives } from "@shared/wc3-def";
import { syncDataByteLength } from "../../src/shared/rxwc3/sync/limits";
import { FakeSyncNetwork } from "./fake-sync-natives";
import { verifySync } from "./sync-lua.spec";

function withErrors(run: (errors: unknown[]) => void): void {
    const previous = config.onUnhandledError,
        previousCheck = config.checkSignalSync;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    config.checkSignalSync = true;
    try {
        run(errors);
    } finally {
        config.onUnhandledError = previous;
        config.checkSignalSync = previousCheck;
    }
}
function setup() {
    const network = new FakeSyncNetwork(),
        a = network.client(0),
        b = network.client(1);
    const sourceA = new Subject<string, Local>(undefined, "local");
    const sourceB = new Subject<string, Local>(undefined, "local");
    const player = network.players[0];
    const options = {
        prefix: "m4.test",
        encode: (v: string) => v,
        decode: (v: string) => `解碼：${v}`,
    };
    return { network, a, b, sourceA, sourceB, player, options };
}

test("Node 執行 Lua 共用的九組 M4 驗證", () => assert.equal(verifySync(), 9));

const basic: [string, OperatorFunction<number, number>][] = [
    ["map", map((v) => v + 1)],
    ["scan", scan((a, b) => a + b, 0)],
    ["tap", tap(() => {})],
    ["filter", filter(() => true)],
    ["take", take(1)],
    ["takeUntil", takeUntil(of())],
    ["takeWhile", takeWhile(() => true)],
    ["distinctUntilChanged", distinctUntilChanged()],
    ["share", share()],
    ["finalize", finalize(() => {})],
    ["delay", delay(1)],
    ["throttleTime", throttleTime(1)],
    ["debounceTime", debounceTime(1)],
];
for (const [name, operation] of basic) {
    test(`${name} 直接呼叫與 pipe 均保留同步及本地標記`, () => {
        const local = toObservable(localSignal(1));
        assert.equal(operation(local).runtimeSyncKind, "local");
        assert.equal(local.pipe(operation).runtimeSyncKind, "local");
        assert.equal(operation(of(1)).runtimeSyncKind, "sync");
    });
}

test("多步 pipe 與獨立 pipe 保留標記，sync 邊界重新標記為同步", () => {
    const s = setup();
    const local = of("值").pipe(
        forLocalPlayer(s.player, s.a),
        map((v) => v),
        take(1),
        share(),
    );
    assert.equal(local.runtimeSyncKind, "local");
    const composed = pipe(
        map((v: string) => v),
        finalize(() => {}),
    );
    assert.equal(composed(local).runtimeSyncKind, "local");
    const result = local.pipe(
        sync(s.player, s.options, s.a),
        map((v) => v),
        share(),
    );
    assert.equal(result.runtimeSyncKind, "sync");
    assert.equal(toSignal(result, "初值").syncKind, "sync");
});

test("merge 任一本地則本地，空合併與全部同步仍為同步", () => {
    const local = toObservable(localSignal(1));
    assert.equal(merge().runtimeSyncKind, "sync");
    assert.equal(merge(of(1), of(2)).runtimeSyncKind, "sync");
    assert.equal(merge(of(1), local).runtimeSyncKind, "local");
    assert.equal(merge(local, of(1)).runtimeSyncKind, "local");
});

test("Subject 唯讀串流與全部本地 Signal 來源保留統一標記", () => {
    const subject = new Subject<number, Local>(undefined, "local");
    assert.equal(subject.asObservable().runtimeSyncKind, "local");
    const local = localSignal(2);
    for (const source of [
        local,
        local.asReadOnly(),
        localComputed(() => local()),
        localLinkedSignal(() => local()),
    ]) {
        const stream = toObservable(source);
        assert.equal(stream.runtimeSyncKind, "local");
        const owner = new Subscription();
        assert.equal(toSignal(stream.pipe(map((v) => v)), 0, { owner }).syncKind, "local");
        owner.unsubscribe();
    }
});

test("toSignal 自動讀取本地標記，三種同步 Consumer 均回報錯誤", () =>
    withErrors((errors) => {
        const owner = new Subscription();
        const value = toSignal(toObservable(localSignal(7)).pipe(map((v) => v)), 0, { owner });
        assert.equal(computed(() => value())(), 7);
        assert.equal(linkedSignal(() => value())(), 7);
        const ref = effect(() => {
            value();
        });
        assert.equal(errors.length, 3);
        config.checkSignalSync = false;
        assert.equal(computed(() => value())(), 7);
        assert.equal(errors.length, 3);
        ref.destroy();
        owner.unsubscribe();
    }));

test("toSignal 的明確選項覆寫標記，舊來源沒有標記時使用選項或同步", () => {
    assert.equal(toSignal(of(1), 0, { syncKind: "local" }).syncKind, "local");
    const owner = new Subscription();
    assert.equal(
        toSignal(toObservable(localSignal(1)), 0, { syncKind: "sync", owner }).syncKind,
        "sync",
    );
    const old = of(2);
    Object.defineProperty(old, "runtimeSyncKind", { value: undefined });
    assert.equal(toSignal(old, 0).syncKind, "sync");
    assert.equal(toSignal(old, 0, { syncKind: "local" }).syncKind, "local");
    owner.unsubscribe();
});

for (const flatten of [mergeMap, switchMap]) {
    test(`${flatten.name} 拒絕未宣告的本地內層，清理來源且不送值`, () =>
        withErrors((errors) => {
            const source = new Subject<number>();
            let reads = 0,
                values = 0;
            const inner = new Observable<number, Local>((s) => {
                reads++;
                s.next(2);
            }, "local");
            const sub = source.pipe(flatten(() => inner)).subscribe(() => {
                values++;
            });
            source.next(1);
            source.next(2);
            assert.equal(sub.closed, true);
            assert.equal(errors.length, 1);
            assert.equal(reads, 0);
            assert.equal(values, 0);
        }));
    test(`${flatten.name} 明確本地內層在建立時標記，也允許本地外層`, () => {
        const inner = toObservable(localSignal(8));
        const stream = of(1).pipe(flatten(() => inner, "local"));
        assert.equal(stream.runtimeSyncKind, "local");
        const owner = new Subscription();
        assert.equal(toSignal(stream, 0, { owner })(), 8);
        assert.equal(toSignal(stream, 0, { owner }).syncKind, "local");
        const outer = inner.pipe(flatten((v) => of(v)));
        assert.equal(outer.runtimeSyncKind, "local");
        owner.add(outer.subscribe());
        owner.unsubscribe();
    });
}

test("forLocalPlayer 兩個用戶端都訂閱來源，只有擁有者收到值", () => {
    const s = setup();
    let starts = 0,
        stops = 0;
    const source = new Observable<number>((subscriber) => {
        starts++;
        subscriber.next(5);
        return () => {
            stops++;
        };
    });
    const first: number[] = [],
        second: number[] = [];
    const a = source
        .pipe(forLocalPlayer({ handle: s.player }, s.a))
        .subscribe((v) => first.push(v));
    const b = source.pipe(forLocalPlayer(s.player, s.b)).subscribe((v) => second.push(v));
    assert.equal(starts, 2);
    assert.deepEqual(first, [5]);
    assert.deepEqual(second, []);
    a.unsubscribe();
    b.unsubscribe();
    assert.equal(stops, 2);
});

test("sync 只有擁有者執行編碼，兩個用戶端延遲收到相同解碼值", () => {
    const s = setup(),
        first: string[] = [],
        second: string[] = [];
    let encodes = 0;
    const options = {
        ...s.options,
        encode: (v: string) => {
            encodes++;
            return v;
        },
    };
    const a = s.sourceA
        .pipe(sync({ handle: s.player }, options, s.a))
        .subscribe((v) => first.push(v));
    const b = s.sourceB.pipe(sync(s.player, options, s.b)).subscribe((v) => second.push(v));
    s.sourceB.next("其他用戶端");
    s.sourceA.next("中文😀");
    assert.equal(encodes, 1);
    assert.equal(s.a.sends, 1);
    assert.equal(s.b.sends, 0);
    assert.deepEqual(first, []);
    assert.deepEqual(second, []);
    s.network.flush();
    assert.deepEqual(first, ["解碼：中文😀"]);
    assert.deepEqual(second, first);
    a.unsubscribe();
    b.unsubscribe();
});

test("資料以 UTF-8 位元組計算，240 邊界可送出，超限與 NUL 不送出", () =>
    withErrors((errors) => {
        const s = setup(),
            values: string[] = [];
        const sub = s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe((v) => values.push(v));
        for (const value of ["x".repeat(240), "文".repeat(80), "😀".repeat(60), ""])
            s.sourceA.next(value);
        for (const value of ["x".repeat(241), "文".repeat(81), "😀".repeat(61), "含\0值"])
            s.sourceA.next(value);
        assert.equal(s.a.sends, 4);
        assert.equal(errors.length, 4);
        s.network.flush();
        assert.equal(values.length, 4);
        sub.unsubscribe();
        for (const value of ["abc", "中文", "😀", "a😀文", "\ud800", "\udc00"]) {
            assert.equal(syncDataByteLength(value), Buffer.byteLength(value, "utf8"));
        }
    }));

test("prefix 必須明確有效，拒絕空值、超長、非 ASCII 與非法字元", () =>
    withErrors((errors) => {
        const s = setup();
        for (const prefix of ["", "a".repeat(33), "中文", "有 空格", "bad/prefix", "bad\0"]) {
            assert.equal(
                s.sourceA.pipe(sync(s.player, { ...s.options, prefix }, s.a)).subscribe().closed,
                true,
            );
        }
        assert.equal(errors.length, 6);
        assert.equal(s.a.creates, 0);
        const sub = s.sourceA
            .pipe(sync(s.player, { ...s.options, prefix: "Aa_0.-" + "z".repeat(26) }, s.a))
            .subscribe();
        assert.equal(s.a.creates, 1);
        sub.unsubscribe();
    }));

test("相同 prefix 的重複串流、重複訂閱與取消後重用均被拒絕", () =>
    withErrors((errors) => {
        const s = setup();
        const stream = s.sourceA.pipe(sync(s.player, s.options, s.a));
        const sub = stream.subscribe();
        assert.equal(stream.subscribe().closed, true);
        assert.equal(s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe().closed, true);
        sub.unsubscribe();
        assert.equal(stream.subscribe().closed, true);
        assert.equal(errors.length, 3);
        assert.equal(s.a.creates, 1);
        assert.equal(s.a.destroys, 1);
    }));

test("share 共用同步觸發器，最後一個取消才刪除", () => {
    const s = setup(),
        values: string[] = [];
    const stream = s.sourceA.pipe(sync(s.player, s.options, s.a), share());
    const a = stream.subscribe((v) => values.push(v)),
        b = stream.subscribe((v) => values.push(v));
    s.sourceA.next("一");
    s.network.flush();
    assert.equal(s.a.creates, 1);
    assert.equal(values.length, 2);
    a.unsubscribe();
    assert.equal(s.a.destroys, 0);
    b.unsubscribe();
    assert.equal(s.a.destroys, 1);
});

test("取消會清理來源與觸發器，在途資料不再送達", () => {
    const s = setup();
    let cleaned = 0,
        received = 0;
    const sub = s.sourceA
        .pipe(
            finalize(() => {
                cleaned++;
            }),
            sync(s.player, s.options, s.a),
        )
        .subscribe(() => {
            received++;
        });
    s.sourceA.next("在途");
    sub.unsubscribe();
    sub.unsubscribe();
    s.sourceA.next("取消後");
    s.network.flush();
    assert.equal(cleaned, 1);
    assert.equal(s.a.destroys, 1);
    assert.equal(received, 0);
    assert.equal(s.a.sends, 1);
});

test("來源完成與錯誤不本地刪除接收觸發器，先前封包仍可送達", () =>
    withErrors((errors) => {
        const s = setup(),
            received: string[] = [];
        const a = s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe((v) => received.push(v));
        s.sourceA.next("一");
        s.sourceA.error(new Error("預期的來源錯誤。"));
        assert.equal(a.closed, false);
        assert.equal(s.a.destroys, 0);
        assert.equal(errors.length, 1);
        s.network.flush();
        assert.deepEqual(received, ["解碼：一"]);
        a.unsubscribe();
    }));

test("編碼與解碼錯誤跳過該值並保留接收器", () =>
    withErrors((errors) => {
        const s = setup();
        let failEncode = true,
            failDecode = true,
            received = 0;
        const sub = s.sourceA
            .pipe(
                sync(
                    s.player,
                    {
                        ...s.options,
                        encode: (value) => {
                            if (failEncode) throw new Error("編碼失敗。");
                            return value;
                        },
                        decode: (value) => {
                            if (failDecode) throw new Error("解碼失敗。");
                            return value;
                        },
                    },
                    s.a,
                ),
            )
            .subscribe(() => {
                received++;
            });
        s.sourceA.next("一");
        assert.equal(s.a.sends, 0);
        failEncode = false;
        s.sourceA.next("二");
        s.network.flush();
        failDecode = false;
        s.sourceA.next("三");
        s.network.flush();
        assert.equal(errors.length, 2);
        assert.equal(received, 1);
        assert.equal(sub.closed, false);
        sub.unsubscribe();
    }));

test("原生送出拒絕、拋錯與接收讀取錯誤均回報，恢復後可繼續", () =>
    withErrors((errors) => {
        const s = setup();
        let received = 0;
        const sub = s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe(() => {
            received++;
        });
        s.a.rejectSend = true;
        s.sourceA.next("拒絕");
        s.a.rejectSend = false;
        s.a.throwSend = true;
        s.sourceA.next("拋錯");
        s.a.throwSend = false;
        s.a.failRead = true;
        s.sourceA.next("讀取");
        s.network.flush();
        s.a.failRead = false;
        s.sourceA.next("恢復");
        s.network.flush();
        assert.equal(errors.length, 3);
        assert.equal(received, 1);
        sub.unsubscribe();
    }));

test("超長的接收封包不執行解碼，錯誤不傳給另一個用戶端", () =>
    withErrors((errors) => {
        const s = setup();
        let decodes = 0;
        const sub = s.sourceA
            .pipe(
                sync(
                    s.player,
                    {
                        ...s.options,
                        decode: (v) => {
                            decodes++;
                            return v;
                        },
                    },
                    s.a,
                ),
            )
            .subscribe();
        s.network.packets.push({
            player: s.player,
            prefix: s.options.prefix,
            data: "x".repeat(241),
        });
        s.network.flush();
        assert.equal(errors.length, 1);
        assert.equal(decodes, 0);
        sub.unsubscribe();
    }));

test("註冊失敗時清理觸發器，不訂閱來源", () =>
    withErrors((errors) => {
        const s = setup();
        s.a.failRegister = true;
        let starts = 0;
        const source = new Observable<string, Local>(() => {
            starts++;
        }, "local");
        const sub = source.pipe(sync(s.player, s.options, s.a)).subscribe();
        assert.equal(errors.length, 1);
        assert.equal(sub.closed, true);
        assert.equal(s.a.creates, 1);
        assert.equal(s.a.destroys, 1);
        assert.equal(starts, 0);
    }));

test("sync 拒絕沒有本地執行時標記的來源", () =>
    withErrors((errors) => {
        const s = setup();
        const source = new Observable<string, Local>();
        assert.equal(source.pipe(sync(s.player, s.options, s.a)).subscribe().closed, true);
        assert.equal(errors.length, 1);
        assert.equal(s.a.creates, 0);
    }));

test("本地串流回呼與 localEffect 中建立 sync 訂閱會回報錯誤", () =>
    withErrors((errors) => {
        const s = setup();
        const subscribe = () => s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe();
        of(1)
            .pipe(forLocalPlayer(s.player, s.a))
            .subscribe(() => {
                assert.equal(subscribe().closed, true);
            });
        const ref = localEffect(() => {
            assert.equal(subscribe().closed, true);
        });
        ref.destroy();
        assert.equal(errors.length, 2);
        assert.equal(s.a.creates, 0);
        const sub = subscribe();
        assert.equal(sub.closed, false);
        assert.equal(s.a.creates, 1);
        sub.unsubscribe();
    }));

test("本地完成、錯誤與清理回呼也不能建立 sync 訂閱", () =>
    withErrors((errors) => {
        const s = setup();
        const subscribe = () => {
            s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe();
        };
        const complete = new Observable<number, Local>(
            (subscriber) => subscriber.complete(),
            "local",
        );
        complete.subscribe({ complete: subscribe });
        complete.pipe(finalize(subscribe)).subscribe();
        new Observable<number, Local>(
            (subscriber) => subscriber.error(new Error("預期的本地錯誤。")),
            "local",
        ).subscribe({ error: subscribe });
        assert.equal(errors.length, 3);
        assert.equal(s.a.creates, 0);
    }));

test("可以辨識的本地取消會回報誤用，但呼叫端仍須在共同流程取消", () =>
    withErrors((errors) => {
        const s = setup();
        const sub = s.sourceA.pipe(sync(s.player, s.options, s.a)).subscribe();
        localEffect(() => sub.unsubscribe()).destroy();
        assert.equal(errors.length, 1);
        assert.equal(s.a.destroys, 1);
    }));

test("正式同步原生介面使用原生參數，註冊 fromServer 為 false", () => {
    const s = setup(),
        trigger = s.a.createTrigger(),
        saved = new Map<string, PropertyDescriptor | undefined>();
    const replace = (name: string, value: unknown) => {
        saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    };
    let callback: (() => void) | undefined,
        destroyed = false,
        sent = false;
    try {
        replace("GetLocalPlayer", () => s.player);
        replace("CreateTrigger", () => trigger);
        replace("DestroyTrigger", (t: unknown) => {
            assert.equal(t, trigger);
            destroyed = true;
        });
        replace("TriggerAddAction", (t: unknown, cb: () => void) => {
            assert.equal(t, trigger);
            callback = cb;
        });
        replace(
            "BlzTriggerRegisterPlayerSyncEvent",
            (t: unknown, p: unknown, prefix: string, server: boolean) => {
                assert.equal(t, trigger);
                assert.equal(p, s.player);
                assert.equal(prefix, "m4.native");
                assert.equal(server, false);
            },
        );
        replace("BlzSendSyncData", (prefix: string, data: string) => {
            assert.equal(prefix, "m4.native");
            assert.equal(data, "資料");
            sent = true;
            return true;
        });
        replace("BlzGetTriggerSyncData", () => "資料");
        assert.equal(wc3SyncNatives.getLocalPlayer(), s.player);
        assert.equal(wc3SyncNatives.createTrigger(), trigger);
        wc3SyncNatives.addAction(trigger, () => {});
        assert.ok(callback);
        wc3SyncNatives.registerSync(trigger, s.player, "m4.native");
        assert.equal(wc3SyncNatives.sendSync("m4.native", "資料"), true);
        assert.equal(sent, true);
        assert.equal(wc3SyncNatives.readSyncData(), "資料");
        wc3SyncNatives.destroyTrigger(trigger);
        assert.equal(destroyed, true);
    } finally {
        for (const [name, descriptor] of saved) {
            if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
            else Object.defineProperty(globalThis, name, descriptor);
        }
    }
});
