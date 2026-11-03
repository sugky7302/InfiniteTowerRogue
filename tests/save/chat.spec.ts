import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setupSave } from "./setup";
import {
    SaveCodec,
    SaveRegistry,
    SaveData,
    createDemoCodec,
    initialDemoData,
    loadCommands,
    manualFragmentLength,
    ManualSaveInput,
    saveFilePath,
    readableSavePath,
} from "../../src/feature/save";
import { encodeFileData, decodeFileData } from "../../src/shared/file-io";
import { Clock } from "../../src/shared/rxwc3";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";

test("存檔收集同步資料，只在擁有者寫入兩份檔案與顯示結果", () => {
    const setup = setupSave();
    try {
        setup.command("-save-demo level 10");
        setup.command("-save-demo gold 500");
        setup.command("-save-demo item 1 2");
        setup.command("-save");
        assert.equal(setup.files[0].writes(), 2);
        assert.equal(setup.files[1].writes(), 0);
        assert(setup.files.every((file) => file.prepares() === 1));
        const code = decodeFileData(setup.files[0].files.get(saveFilePath)!)!;
        assert.deepEqual(
            createDemoCodec().decode(code, setup.names.get(setup.network.players[0])!),
            { demo: { level: 10, gold: 500, items: [2, 0, 0, 0, 0, 0] } },
        );
        const readable = setup.files[0].outputs.get(readableSavePath)!.join("\n");
        assert(readable.includes(`-load ${code}`));
        assert(readable.includes("-load 1/1 "));
        assert(
            setup.displays.every(
                (event) => event.client === 0 && event.player === setup.network.players[0],
            ),
        );
        assert(setup.displays.some((event) => event.text.includes("尚未確認磁碟寫入")));
        assert.equal(setup.network.packets.length, 0);
        assert.deepEqual(
            setup.services[0].states.get(setup.network.players[0]),
            setup.services[1].states.get(setup.network.players[0]),
        );
    } finally {
        setup.close();
    }
});
test("自動讀檔等待同步後才套用，兩個用戶端取得相同資料", () => {
    const setup = setupSave();
    try {
        setup.command("-save-demo gold 800");
        setup.command("-save");
        setup.command("-save-demo gold 1");
        setup.command("-load");
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 1,
            ),
        );
        assert.equal(setup.network.clients[1].sends, 0);
        setup.network.flush();
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 800,
            ),
        );
    } finally {
        setup.close();
    }
});
test("手動完整碼直接同步套用，不送出網路封包", () => {
    const setup = setupSave();
    try {
        const data = { demo: { level: 98, gold: 999999, items: [3, 2, 1, 0, 3, 2] } };
        const code = createDemoCodec().encode(data, setup.names.get(setup.network.players[0])!)!;
        setup.command(`-load ${code}`);
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 999999,
            ),
        );
        assert.equal(setup.network.packets.length, 0);
    } finally {
        setup.close();
    }
});

function extended() {
    const registry = new SaveRegistry().register({
        version: 1,
        sections: [
            {
                name: "demo",
                fields: [
                    { name: "level", kind: "uint", min: 1, max: 100 },
                    { name: "gold", kind: "uint", min: 0, max: 1000000 },
                    { name: "items", kind: "list", min: 0, max: 3, length: 6 },
                ],
            },
            {
                name: "future",
                fields: [{ name: "values", kind: "list", min: 0, max: 255, length: 256 }],
            },
        ],
    });
    const codec = new SaveCodec(registry, 1);
    const data: SaveData = {
        ...initialDemoData(),
        future: { values: Array.from({ length: 256 }, (_, index) => index) },
    };
    data.demo.gold = 123456;
    return { codec, data };
}
test("長存檔自動分段並可用亂序手動指令完整載入", () => {
    const { codec, data } = extended();
    const setup = setupSave(codec);
    try {
        for (const service of setup.services) service.states.set(setup.network.players[0], data);
        setup.command("-save");
        const commands = setup.files[0].outputs
            .get(readableSavePath)!
            .map((line) => line.slice(6, -3));
        assert(commands.length > 1 && commands.every((command) => command.length <= 126));
        setup.command("-save-demo gold 0");
        setup.command("-load");
        assert(setup.network.packets.length > 1);
        setup.network.packets.reverse();
        setup.network.flush();
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 123456,
            ),
        );
        setup.command("-save-demo gold 0");
        for (const command of commands.slice(1).reverse()) setup.command(command);
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 0,
            ),
        );
        setup.command(commands[0]);
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 123456,
            ),
        );
        assert.equal(setup.network.packets.length, 0);
    } finally {
        setup.close();
    }
});
for (const mode of ["不存在", "框架損壞", "碼無效", "讀取例外", "超長檔案"] as const) {
    test(`自動讀檔處理${mode}，保留原資料並提示手動輸入`, () => {
        const setup = setupSave();
        try {
            if (mode === "框架損壞") setup.files[0].files.set(saveFilePath, "損壞");
            if (mode === "碼無效")
                setup.files[0].files.set(saveFilePath, encodeFileData("INVALID")!);
            if (mode === "讀取例外") setup.files[0].failRead(true);
            if (mode === "超長檔案")
                setup.files[0].files.set(saveFilePath, encodeFileData("A".repeat(2000))!);
            setup.command("-save-demo level 80");
            setup.command("-load");
            setup.network.flush();
            assert(
                setup.services.every(
                    (service) => service.states.get(setup.network.players[0])!.demo.level === 80,
                ),
            );
            assert(setup.displays.some((event) => event.text.includes("改用 -load <存檔碼>")));
            assert(setup.displays.every((event) => event.client === 0));
        } finally {
            setup.close();
        }
    });
}
test("無效手動碼與其他玩家的碼顯示相同訊息且不套用", () => {
    const setup = setupSave();
    try {
        const code = createDemoCodec().encode(initialDemoData(), "另一位玩家")!;
        setup.command("-save-demo gold 500");
        setup.displays.length = 0;
        setup.command("-load BAD");
        setup.command(`-load ${code}`);
        assert.deepEqual(
            setup.displays.map((event) => event.text),
            ["存檔碼無效。", "存檔碼無效。"],
        );
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.gold === 500,
            ),
        );
    } finally {
        setup.close();
    }
});
test("第二位玩家有獨立資料、檔案與前綴", () => {
    const setup = setupSave();
    try {
        setup.command("-save-demo level 30", 0);
        setup.command("-save-demo level 70", 1);
        setup.command("-save", 0);
        setup.command("-save", 1);
        setup.command("-save-demo level 1", 0);
        setup.command("-save-demo level 1", 1);
        setup.command("-load", 0);
        setup.command("-load", 1);
        setup.network.flush();
        for (const service of setup.services) {
            assert.equal(service.states.get(setup.network.players[0])!.demo.level, 30);
            assert.equal(service.states.get(setup.network.players[1])!.demo.level, 70);
        }
        assert(setup.files.every((file) => file.writes() === 2));
        assert(
            setup.displays.every((event) => setup.network.players[event.client] === event.player),
        );
    } finally {
        setup.close();
    }
});
test("顯示原始玩家名稱與目前資料，拒絕無效範例值", () => {
    const setup = setupSave();
    try {
        for (const message of [
            "level 0",
            "gold 1000001",
            "item 7 1",
            "item 1 4",
            "item 1 -1",
            "gold NaN",
            "level 1.5",
            "gold",
        ])
            setup.command(`-save-demo ${message}`);
        assert.deepEqual(setup.services[0].states.get(setup.network.players[0]), initialDemoData());
        setup.command("-save-demo show");
        assert(
            setup.displays.at(-1)!.text.includes(`[${setup.names.get(setup.network.players[0])}]`),
        );
        assert(setup.displays.at(-1)!.text.includes("等級 1，金錢 0"));
    } finally {
        setup.close();
    }
});
test("寫檔失敗仍顯示可手動備份的存檔碼", () => {
    const setup = setupSave();
    setup.files[0].failWrite(true);
    try {
        setup.command("-save");
        assert(setup.displays.some((event) => event.text.includes("寫入失敗")));
        assert(setup.displays.some((event) => event.text.startsWith("存檔碼 ")));
    } finally {
        setup.close();
    }
});
test("單片上限為 80，最長格式的每條指令均小於 127 字元", () => {
    assert.equal(manualFragmentLength, 80);
    const commands = loadCommands("A".repeat(1016));
    assert(commands.length > 9 && commands.every((command) => command.length <= 126));
    assert(encodeFileData(commands.join(" | ")));
});
test("手動分段逾時與遲到片段不會套用，重新輸入可恢復", () => {
    const driver = new FakeClockDriver();
    const clock = new Clock(driver);
    let failures = 0;
    const input = new ManualSaveInput(clock, () => {
        failures++;
    });
    assert.equal(input.accept("1/2 AAA"), undefined);
    driver.advance(61);
    assert.equal(failures, 1);
    assert.equal(input.accept("2/2 BBB"), undefined);
    assert.equal(input.accept("1/2 CCC"), "CCCBBB");
    assert.equal(input.accept("1/2 AAA"), undefined);
    assert.equal(input.accept("1/2 CCC"), undefined);
    assert.equal(input.accept("2/2 DDD"), "CCCDDD");
    input.reset();
    assert.equal(clock.pendingCount(), 0);
});
test("手動分段拒絕超長片段、錯誤分母、衝突與非法索引", () => {
    const clock = new Clock(new FakeClockDriver());
    let failures = 0;
    const input = new ManualSaveInput(clock, () => {
        failures++;
    });
    for (const text of ["0/2 A", "3/2 A", "1/0 A", "1/15 A", "1/2", "1/2 " + "A".repeat(81)])
        assert.equal(input.accept(text), undefined);
    assert.equal(failures, 6);
    input.accept("1/3 AAA");
    input.accept("2/3 BBB");
    input.accept("2/3 CCC");
    assert.equal(failures, 7);
    input.reset();
});
test("同一玩家連續自動讀檔以新傳輸覆蓋舊傳輸", () => {
    const setup = setupSave();
    const codec = createDemoCodec();
    const name = setup.names.get(setup.network.players[0])!;
    try {
        setup.files[0].files.set(
            saveFilePath,
            encodeFileData(
                codec.encode({ demo: { ...initialDemoData().demo, level: 10 } }, name)!,
            )!,
        );
        setup.command("-load");
        const old = setup.network.packets.splice(0);
        setup.files[0].files.set(
            saveFilePath,
            encodeFileData(
                codec.encode({ demo: { ...initialDemoData().demo, level: 90 } }, name)!,
            )!,
        );
        setup.command("-load");
        setup.network.packets.push(...old);
        setup.network.flush();
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.level === 90,
            ),
        );
    } finally {
        setup.close();
    }
});
test("取消整合後不再寫檔、顯示或接收聊天", () => {
    const setup = setupSave();
    setup.close();
    setup.command("-save");
    setup.command("-save-demo show");
    assert.equal(setup.displays.length, 0);
    assert(setup.files.every((file) => file.writes() === 0));
    assert(setup.network.clients.every((client) => client.creates === client.destroys));
});

test("範例短碼仍送出多個片段，全部封包遺失時逾時且拒絕遲到結果", () => {
    const setup = setupSave();
    try {
        setup.command("-save-demo level 50");
        setup.command("-save");
        setup.command("-save-demo level 1");
        setup.command("-load");
        assert(setup.network.packets.length > 1);
        setup.drivers.forEach((driver) => driver.advance(16));
        assert(setup.displays.some((event) => event.text.includes("已逾時")));
        setup.network.flush();
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.level === 1,
            ),
        );
        setup.command("-load");
        setup.network.flush();
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.level === 50,
            ),
        );
    } finally {
        setup.close();
    }
});
test("後輸入的手動讀檔取代在途自動讀檔", () => {
    const setup = setupSave();
    try {
        setup.command("-save-demo level 50");
        setup.command("-save");
        setup.command("-load");
        const manual = createDemoCodec().encode(
            { demo: { ...initialDemoData().demo, level: 90 } },
            setup.names.get(setup.network.players[0])!,
        )!;
        setup.command(`-load ${manual}`);
        setup.network.flush();
        assert(
            setup.services.every(
                (service) => service.states.get(setup.network.players[0])!.demo.level === 90,
            ),
        );
        setup.drivers.forEach((driver) => driver.advance(16));
        assert(!setup.displays.some((event) => event.text.includes("已逾時")));
    } finally {
        setup.close();
    }
});
test("全部送出被原生函式拒絕時仍顯示讀檔逾時", () => {
    const setup = setupSave();
    const { config } = require("../../src/shared/rxwc3") as typeof import("../../src/shared/rxwc3");
    const previous = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    try {
        setup.network.clients[0].rejectSend = true;
        setup.command("-load");
        setup.drivers.forEach((driver) => driver.advance(16));
        assert(errors.length > 0);
        assert(setup.displays.some((event) => event.text.includes("已逾時")));
    } finally {
        setup.close();
        config.onUnhandledError = previous;
    }
});
