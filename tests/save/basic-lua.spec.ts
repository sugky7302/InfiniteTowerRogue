import {
    SaveCodec,
    compactCode,
    createDemoRegistry,
    createDemoCodec,
    initialDemoData,
    hmac256,
    sha256,
    utf8,
} from "@features/save";
import { Subject, Observable, Clock, syncChunked } from "../../src/shared/lib/rxwc3";
import { FakeSyncNetwork } from "../rxwc3/fake-sync-natives";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";
import { setupSave } from "./setup";
export { wc3PlayerNatives } from "@shared/lib/wc3-def";
export { recordsCases, verifyRecords } from "./records-cases";

function check(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

function hex(bytes: readonly number[]): string {
    return bytes.map((value) => (value < 16 ? "0" : "") + value.toString(16)).join("");
}

/** Node 與 Lua 共用。Lua 驗證器會先關閉 debug。 */
export function verifySave(): number {
    let groups = 0;
    check(
        hex(sha256(utf8("abc"))) ===
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        "SHA-256 已知向量錯誤。",
    );
    groups++;
    check(
        hex(hmac256(utf8("key"), utf8("The quick brown fox jumps over the lazy dog"))) ===
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
        "HMAC 已知向量錯誤。",
    );
    groups++;
    check(hex(utf8("玩家😀")) === "e78ea9e5aeb6f09f9880", "玩家名稱 UTF-8 編碼錯誤。");
    groups++;
    const codec = createDemoCodec();
    for (const data of [
        initialDemoData(),
        { demo: { level: 100, gold: 1000000, items: [3, 3, 3, 3, 3, 3] } },
    ]) {
        const code = codec.encode(data, " 玩家Alice#1234 ")!;
        const loaded = codec.decode(code, "玩家alice#1234")!;
        check(
            loaded.demo.level === data.demo.level &&
                loaded.demo.gold === data.demo.gold &&
                (loaded.demo.items as number[]).join(",") ===
                    (data.demo.items as number[]).join(","),
            "存檔邊界往返錯誤。",
        );
    }
    groups++;
    const code = codec.encode(initialDemoData(), "Alice")!;
    check(
        codec.decode(code, "Bob") === undefined &&
            codec.decode(code.slice(0, -1) + "U", "Alice") === undefined,
        "無效存檔未被拒絕。",
    );
    groups++;
    const aliases = compactCode(code).toLowerCase().split("0").join("o").split("1").join("l");
    check(codec.decode(" \t" + aliases + "\n", "alice") !== undefined, "別名字元無法解碼。");
    groups++;
    const legacy = new SaveCodec(createDemoRegistry(), 1);
    const old = legacy.encode({ demo: { level: 50, gold: 65535, items: [1, 2, 3] } }, "Alice")!;
    const migrated = codec.decode(old, "Alice")!;
    check(
        (migrated.demo.items as number[]).join(",") === "1,2,3,0,0,0" &&
            migrated.demo.gold === 65535,
        "舊版轉換錯誤。",
    );
    groups++;
    const network = new FakeSyncNetwork();
    const driver = new FakeClockDriver();
    const source = new Subject<string, "local">(undefined, "local");
    const remote = new Observable<string, "local">(undefined, "local");
    const received: string[][] = [[], []];
    const subscriptions = [source, remote].map((input, index) =>
        input
            .pipe(
                syncChunked(
                    network.players[0],
                    {
                        prefix: "save.lua",
                        encode: (value) => value,
                        decode: (value) => value,
                        clock: new Clock(index === 0 ? driver : new FakeClockDriver()),
                    },
                    network.client(index),
                ),
            )
            .subscribe((value) => {
                received[index].push(value);
            }),
    );
    source.next("A".repeat(900));
    network.packets.reverse();
    network.flush();
    check(
        received[0][0] === "A".repeat(900) && received[1][0] === received[0][0],
        "多用戶端亂序重組錯誤。",
    );
    source.next("玩家😀".repeat(100));
    network.packets.reverse();
    network.flush();
    check(
        received[0][1] === "玩家😀".repeat(100) && received[1][1] === received[0][1],
        "UTF-8 分段重組錯誤。",
    );
    groups++;
    for (const subscription of subscriptions) subscription.unsubscribe();
    const setup = setupSave();
    try {
        setup.command("-save-demo level 83");
        setup.command("-save-demo gold 999999");
        setup.command("-save");
        setup.command("-save-demo level 1");
        setup.command("-load");
        check(
            setup.services[0].states.get(setup.network.players[0])!.demo.level === 1,
            "讀檔未等待同步。",
        );
        setup.network.flush();
        check(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.level === 83,
            ),
            "完整存讀流程錯誤。",
        );
        groups++;
        check(
            setup.files[0].writes() === 2 &&
                setup.files[1].writes() === 0 &&
                setup.displays.every((event) => event.client === 0),
            "本地檔案或顯示範圍錯誤。",
        );
        groups++;
    } finally {
        setup.close();
    }
    return groups;
}
