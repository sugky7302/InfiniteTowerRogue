import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    Observable,
    Subject,
    Clock,
    syncChunked,
    sync,
    config,
    forLocalPlayer,
} from "../../src/shared/rxwc3";
import { splitSyncData } from "../../src/shared/rxwc3/sync/sync-chunked";
import {
    FragmentReceiver,
    decodeFragment,
    fragmentNumber,
} from "../../src/shared/rxwc3/sync/fragments";
import { FakeSyncNetwork } from "./fake-sync-natives";
import { FakeClockDriver } from "./fake-clock-driver";

function setup() {
    const network = new FakeSyncNetwork();
    const sources = [
        new Subject<string, "local">(undefined, "local"),
        new Subject<string, "local">(undefined, "local"),
    ];
    const drivers = [new FakeClockDriver(), new FakeClockDriver()];
    const received: string[][] = [[], []];
    const failures = [0, 0];
    const clients = [network.client(0), network.client(1)];
    const subscriptions = sources.map((source, index) =>
        source
            .pipe(
                syncChunked(
                    network.players[0],
                    {
                        prefix: "chunks.test",
                        encode: (value) => value,
                        decode: (value) => value,
                        clock: new Clock(drivers[index]),
                        timeoutMilliseconds: 1000,
                        onReceiveFailure: () => {
                            failures[index]++;
                        },
                    },
                    clients[index],
                ),
            )
            .subscribe((value) => {
                received[index].push(value);
            }),
    );
    return {
        network,
        sources,
        drivers,
        received,
        failures,
        clients,
        close: () => subscriptions.forEach((subscription) => subscription.unsubscribe()),
    };
}

test("分段同步在兩個用戶端重組，含空字串與 4096 位元組", () => {
    const setup_ = setup();
    try {
        for (const value of ["", "A", "Z".repeat(4096)]) {
            setup_.sources[0].next(value);
            assert(setup_.network.packets.every((packet) => Buffer.byteLength(packet.data) <= 240));
            setup_.network.flush();
            assert.equal(setup_.received[0].at(-1), value);
            assert.equal(setup_.received[1].at(-1), value);
        }
    } finally {
        setup_.close();
    }
});
test("亂序與相同片段重複送達只發出一個值", () => {
    const setup_ = setup();
    try {
        setup_.sources[0].next("ABCD".repeat(250));
        setup_.network.packets.push({ ...setup_.network.packets[1] });
        setup_.network.packets.reverse();
        setup_.network.flush();
        assert.deepEqual(setup_.received, [["ABCD".repeat(250)], ["ABCD".repeat(250)]]);
    } finally {
        setup_.close();
    }
});
test("片段遺失時不發出部分值，逾時後拒絕遲到片段", () => {
    const setup_ = setup();
    try {
        setup_.sources[0].next("A".repeat(600));
        const missing = setup_.network.packets.splice(1, 1)[0];
        setup_.network.flush();
        assert.deepEqual(setup_.received, [[], []]);
        setup_.drivers.forEach((driver) => driver.advance(1.1));
        assert.deepEqual(setup_.failures, [1, 1]);
        setup_.network.packets.push(missing);
        setup_.network.flush();
        assert.deepEqual(setup_.received, [[], []]);
        setup_.sources[0].next("恢復");
        setup_.network.flush();
        assert.deepEqual(setup_.received, [["恢復"], ["恢復"]]);
    } finally {
        setup_.close();
    }
});
test("同一玩家新傳輸覆蓋舊傳輸，舊片段及完成後重播均被忽略", () => {
    const setup_ = setup();
    try {
        setup_.sources[0].next("A".repeat(600));
        const old = setup_.network.packets.splice(0);
        setup_.network.packets.push(old[0]);
        setup_.network.flush();
        setup_.sources[0].next("B".repeat(600));
        const replay = [...setup_.network.packets];
        setup_.network.packets.push(...old, ...replay);
        setup_.network.flush();
        assert.deepEqual(setup_.received, [["B".repeat(600)], ["B".repeat(600)]]);
    } finally {
        setup_.close();
    }
});
test("只有擁有者送出，遠端來源不會執行編碼", () => {
    const setup_ = setup();
    try {
        setup_.sources[1].next("遠端資料");
        assert.equal(setup_.network.packets.length, 0);
        setup_.sources[0].next("擁有者資料");
        setup_.network.flush();
        assert.equal(setup_.clients[0].sends, 1);
        assert.equal(setup_.clients[1].sends, 0);
    } finally {
        setup_.close();
    }
});
test("UTF-8 中文與代理對分段保持內容，封包低於上限", () => {
    const setup_ = setup();
    try {
        const value = "玩家😀".repeat(400);
        setup_.sources[0].next(value);
        assert(setup_.network.packets.every((packet) => Buffer.byteLength(packet.data) <= 240));
        setup_.network.flush();
        assert.deepEqual(setup_.received, [[value], [value]]);
    } finally {
        setup_.close();
    }
});
test("超長資料與 NUL 在送出前全部拒絕，之後仍可重試", () => {
    const setup_ = setup();
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    try {
        for (const value of ["A".repeat(4097), "中".repeat(1366), "A\0B"])
            setup_.sources[0].next(value);
        assert.equal(setup_.network.packets.length, 0);
        assert.equal(errors.length, 3);
        setup_.sources[0].next("有效");
        setup_.network.flush();
        assert.deepEqual(setup_.received, [["有效"], ["有效"]]);
    } finally {
        setup_.close();
        config.onUnhandledError = saved;
    }
});
test("解碼失敗與原生送出拒絕不會結束接收器", () => {
    const network = new FakeSyncNetwork();
    const client = network.client(0);
    const source = new Subject<string, "local">(undefined, "local");
    const errors: unknown[] = [];
    const received: string[] = [];
    const saved = config.onUnhandledError;
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    const subscription = source
        .pipe(
            syncChunked(
                network.players[0],
                {
                    prefix: "chunks.errors",
                    encode: (value) => value,
                    decode: (value) => {
                        if (value === "錯誤") throw new Error("預期的解碼錯誤。");
                        return value;
                    },
                    clock: new Clock(new FakeClockDriver()),
                },
                client,
            ),
        )
        .subscribe((value) => {
            received.push(value);
        });
    try {
        client.rejectSend = true;
        source.next("拒絕");
        client.rejectSend = false;
        source.next("錯誤");
        network.flush();
        source.next("正常");
        network.flush();
        assert.deepEqual(received, ["正常"]);
        assert.equal(errors.length, 2);
    } finally {
        subscription.unsubscribe();
        config.onUnhandledError = saved;
    }
});
test("接收器拒絕衝突片段、錯誤總數、超長累積與非法序號", () => {
    const clock = new Clock(new FakeClockDriver());
    let failures = 0;
    const receiver = new FragmentReceiver(clock, 1000, () => {
        failures++;
    });
    assert.equal(receiver.accept({ transfer: 1, index: 1, count: 2, data: "A" }), undefined);
    receiver.accept({ transfer: 1, index: 1, count: 2, data: "B" });
    receiver.accept({ transfer: 2, index: 1, count: 2, data: "A" });
    receiver.accept({ transfer: 2, index: 2, count: 3, data: "B" });
    for (let index = 1; index <= 22; index++)
        receiver.accept({ transfer: 3, index, count: 22, data: "A".repeat(200) });
    for (const fragment of [
        { transfer: 4, index: 0, count: 1, data: "A" },
        { transfer: 0, index: 1, count: 1, data: "A" },
        { transfer: 4, index: 1, count: 65, data: "A" },
        { transfer: 4, index: 1.5, count: 2, data: "A" },
    ])
        assert.equal(receiver.accept(fragment), undefined);
    assert.equal(failures, 3);
    receiver.clear();
    assert.equal(clock.pendingCount(), 0);
});
test("片段標頭限制數字長度與語法", () => {
    for (const text of ["0", "01", "-1", "1.0", "a", "99999999", "1048576"])
        assert.equal(fragmentNumber(text), undefined);
    for (const text of ["", "1/1:A", "1/01/1:A", "1/1/1/1:A", "999999999/1/1:A"])
        assert.equal(decodeFragment(text), undefined);
    assert.deepEqual(decodeFragment("1/1/1:A:B"), { transfer: 1, index: 1, count: 1, data: "A:B" });
    assert.equal(splitSyncData("A".repeat(4097)), undefined);
});
test("取消訂閱會銷毀觸發器並移除接收逾時排程", () => {
    const setup_ = setup();
    setup_.sources[0].next("A".repeat(600));
    setup_.network.packets.pop();
    setup_.network.flush();
    setup_.close();
    setup_.drivers.forEach((driver) => driver.advance(2));
    assert.deepEqual(setup_.failures, [0, 0]);
    assert(setup_.clients.every((client) => client.creates === 1 && client.destroys === 1));
});
test("明確 prefix 不得與既有 sync 重複，且拒絕同步來源", () => {
    const network = new FakeSyncNetwork();
    const client = network.client(0);
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    const source = new Observable<string, "local">(undefined, "local");
    const options = {
        prefix: "unique",
        encode: (value: string) => value,
        decode: (value: string) => value,
        clock: new Clock(new FakeClockDriver()),
    };
    const a = source.pipe(syncChunked(network.players[0], options, client)).subscribe();
    const b = source.pipe(sync(network.players[0], options, client)).subscribe();
    const c = (syncChunked(network.players[0], { ...options, prefix: "other" }, client) as any)(
        new Subject<string>(),
    ).subscribe();
    try {
        assert.equal(errors.length, 2);
        assert.equal(client.creates, 1);
    } finally {
        a.unsubscribe();
        b.unsubscribe();
        c.unsubscribe();
        config.onUnhandledError = saved;
    }
});
test("本地回呼不得建立分段同步訂閱", () => {
    const network = new FakeSyncNetwork();
    const client = network.client(0);
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    const source = new Subject<void>();
    const subscription = source.pipe(forLocalPlayer(network.players[0], client)).subscribe(() => {
        new Observable<string, "local">(undefined, "local")
            .pipe(
                syncChunked(
                    network.players[0],
                    { prefix: "bad.local", encode: (v) => v, decode: (v) => v },
                    client,
                ),
            )
            .subscribe();
    });
    try {
        source.next();
        assert.equal(client.creates, 0);
        assert.equal(errors.length, 1);
    } finally {
        subscription.unsubscribe();
        config.onUnhandledError = saved;
    }
});

test("分段長度設定受限，較小片段仍遵守總片數上限", () => {
    for (const bytes of [0, 3, 201, 4.5]) assert.equal(splitSyncData("ABC", bytes), undefined);
    assert.deepEqual(splitSyncData("ABCDEFGHI", 4), ["ABCD", "EFGH", "I"]);
    assert.equal(splitSyncData("A".repeat(257), 4), undefined);
});
test("擁有者的編碼器例外可恢復，遠端來源不會呼叫編碼器", () => {
    const network = new FakeSyncNetwork();
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    const sources = [
        new Subject<string, "local">(undefined, "local"),
        new Subject<string, "local">(undefined, "local"),
    ];
    const calls = [0, 0];
    const received: string[][] = [[], []];
    const subscriptions = sources.map((source, index) =>
        source
            .pipe(
                syncChunked(
                    network.players[0],
                    {
                        prefix: "encode.error",
                        clock: new Clock(new FakeClockDriver()),
                        encode: (value) => {
                            calls[index]++;
                            if (value === "錯誤") throw new Error("預期的編碼錯誤。");
                            return value;
                        },
                        decode: (value) => value,
                    },
                    network.client(index),
                ),
            )
            .subscribe((value) => {
                received[index].push(value);
            }),
    );
    try {
        sources[1].next("錯誤");
        sources[0].next("錯誤");
        sources[0].next("正常");
        network.flush();
        assert.deepEqual(calls, [2, 0]);
        assert.equal(errors.length, 1);
        assert.deepEqual(received, [["正常"], ["正常"]]);
    } finally {
        subscriptions.forEach((subscription) => subscription.unsubscribe());
        config.onUnhandledError = saved;
    }
});
