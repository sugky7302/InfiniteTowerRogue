import { strict as assert } from "node:assert";
import { test as nodeTest } from "node:test";
import { config, Subject, localComputed, localEffect } from "../../src/shared/rxwc3";
import { createI18n } from "../../src/shared/i18n/translation";
import { createObjectText } from "../../src/shared/i18n/object-text";
import { localeFromClient } from "../../src/shared/i18n/locale";
import { installLanguageChat } from "../../src/shared/i18n/chat";
import { ChatEvent } from "../../src/shared/wc3-def/events";
import { FakeSyncNetwork } from "../rxwc3/fake-sync-natives";
import { fakeNatives, fixtureData } from "./fake-natives";
import { verifyI18n } from "./i18n-lua.spec";

function test(name: string, run: () => void): void {
    nodeTest(name, () => {
        const saved = config.onUnhandledError;
        const errors: unknown[] = [];
        config.onUnhandledError = (error) => {
            errors.push(error);
        };
        try {
            run();
            assert.deepEqual(errors, []);
        } finally {
            config.onUnhandledError = saved;
        }
    });
}
const service = () => createI18n(fakeNatives().natives);

test("多語言在 Node 執行七組 Lua 共用流程", () => assert.equal(verifyI18n(), 7));
test("翻譯支援缺少參數、數字零與不重複解析", () => {
    const s = service();
    assert.equal(s.t("example.greeting"), "你好，{name}。");
    assert.equal(s.t("example.greeting", { name: 0 }), "你好，0。");
    assert.equal(s.t("example.greeting", { name: "{name}" }), "你好，{name}。");
});
test("三種語言的程式文字均可使用", () => {
    const s = service();
    s.language.set("zh-CN");
    assert.equal(s.t("example.ready"), "多语言示例已启动。");
    s.language.set("en-US");
    assert.equal(s.t("example.ready"), "The language example is ready.");
});
test("語言對應接受連字號、底線、大小寫並使用明確後備語言", () => {
    for (const raw of ["zhTW", "zh-TW", "ZH_tw", " zh-tw "])
        assert.equal(localeFromClient(raw), "zh-TW");
    for (const raw of ["zhCN", "ZH-cn", "zh_CN"]) assert.equal(localeFromClient(raw), "zh-CN");
    for (const raw of ["enUS", "EN-us", "en_US"]) assert.equal(localeFromClient(raw), "en-US");
    for (const raw of ["", "jaJP", "enGB", "zhHK"]) assert.equal(localeFromClient(raw), "zh-TW");
});
test("服務以用戶端語言初始化並保存原始值", () => {
    const s = createI18n({ getLocale: () => "EN-us" });
    assert.equal(s.rawLocale, "EN-us");
    assert.equal(s.language(), "en-US");
});
test("本地計算追蹤 t 並略過相同語言", () => {
    const s = service();
    const values: string[] = [];
    const label = localComputed(() => s.t("example.ready"));
    const ref = localEffect(() => {
        values.push(label());
    });
    s.language.set("en-US");
    s.language.set("en-US");
    assert.equal(values.length, 2);
    assert.equal(label(), "The language example is ready.");
    ref.destroy();
});

function clients() {
    const network = new FakeSyncNetwork();
    const chat = new Subject<ChatEvent>();
    const a = service();
    const b = service();
    const messages: string[][] = [[], []];
    const owners = [a, b].map((s, id) =>
        installLanguageChat(
            s,
            chat,
            network.players,
            (text) => {
                messages[id].push(text);
            },
            network.client(id),
        ),
    );
    return {
        network,
        chat,
        a,
        b,
        messages,
        stop: () => {
            owners.forEach((owner) => owner.unsubscribe());
        },
    };
}
test("聊天只切換輸入者的用戶端且不送出同步封包", () => {
    const c = clients();
    c.chat.next({ player: c.network.players[0], message: "-lang en-US" });
    assert.equal(c.a.language(), "en-US");
    assert.equal(c.b.language(), "zh-TW");
    c.chat.next({ player: c.network.players[1], message: "-lang zh-CN" });
    assert.equal(c.a.language(), "en-US");
    assert.equal(c.b.language(), "zh-CN");
    assert.equal(c.network.packets.length, 0);
    c.stop();
});
test("無效代碼與空指令只對輸入者顯示語言清單", () => {
    const c = clients();
    for (const message of ["-lang ja-JP", "-lang", "-lang en-us", "-lang en-US extra"]) {
        c.chat.next({ player: c.network.players[1], message });
    }
    assert.deepEqual(c.messages[0], []);
    assert.equal(c.messages[1].length, 4);
    assert(c.messages[1].every((text) => text.includes("zh-TW") && text.includes("en-US")));
    assert.equal(c.b.language(), "zh-TW");
    c.stop();
});
test("聊天拒絕前綴相似的其他命令並可取消", () => {
    const c = clients();
    c.chat.next({ player: c.network.players[0], message: "-language en-US" });
    assert.equal(c.a.language(), "zh-TW");
    c.stop();
    c.chat.next({ player: c.network.players[0], message: "-lang en-US" });
    assert.equal(c.a.language(), "zh-TW");
});
test("物件切換套用現有實例並使用基準語言補足缺少翻譯", () => {
    const s = service();
    const fake = fakeNatives();
    const manager = createObjectText(s, fixtureData(), fake.natives);
    const unit = {} as unit;
    const item = {} as item;
    manager.trackUnit(unit);
    manager.trackItem(item);
    fake.calls.length = 0;
    s.language.set("en-US");
    assert.deepEqual(
        fake.calls.map((call) => [call.field, call.text, call.level]),
        [
            ["tip", "技能一", 0],
            ["ubertip", "技能二說明", 1],
            ["name", "Guard", 0],
            ["properNames", "明光", 0],
            ["name", "Charm", 0],
        ],
    );
    manager.destroy();
});
test("新單位與物品立即使用目前語言且重複登記不重複更新", () => {
    const s = service();
    const fake = fakeNatives();
    const manager = createObjectText(s, fixtureData(), fake.natives);
    s.language.set("en-US");
    const unit = {} as unit;
    const item = {} as item;
    manager.trackUnit(unit);
    manager.trackUnit(unit);
    manager.trackItem(item);
    manager.trackItem(item);
    assert(fake.calls.some((call) => call.target === item && call.text === "Charm"));
    fake.calls.length = 0;
    s.language.set("zh-CN");
    assert.equal(
        fake.calls.filter((call) => call.target === unit && call.field === "name").length,
        1,
    );
    assert.equal(fake.calls.filter((call) => call.target === item).length, 1);
    manager.destroy();
});
test("取消登記與停止後不再更新物件", () => {
    const s = service();
    const fake = fakeNatives();
    const manager = createObjectText(s, fixtureData(), fake.natives);
    const unit = {} as unit;
    const item = {} as item;
    manager.trackUnit(unit);
    manager.trackItem(item);
    manager.forgetUnit(unit);
    manager.forgetItem(item);
    fake.calls.length = 0;
    s.language.set("en-US");
    assert.equal(fake.calls.length, 2);
    manager.destroy();
    fake.calls.length = 0;
    s.language.set("zh-CN");
    assert.equal(fake.calls.length, 0);
});
test("物品的四個欄位、技能的六種說明與英雄名稱清單可套用", () => {
    const s = service();
    const fake = fakeNatives();
    const data = fixtureData();
    data.tables["zh-TW"]["unit:H0I1:properNames"] = "明光,晨光";
    for (const field of ["tip", "ubertip", "description"]) {
        const key = `item:I0I1:${field}`;
        data.entries.push({ key, kind: "item", id: 1227901233, field, level: 0 });
        data.tables["zh-TW"][key] = field;
    }
    for (const field of ["untip", "unubertip", "researchtip", "researchubertip"]) {
        const key = `ability:A0I1:${field}:1`;
        data.entries.push({ key, kind: "ability", id: 1093683505, field, level: 1 });
        data.tables["zh-TW"][key] = field;
    }
    const manager = createObjectText(s, data, fake.natives);
    const item = {} as item;
    manager.trackUnit({} as unit);
    manager.trackItem(item);
    assert.equal(fake.calls.filter((call) => call.target === item).length, 4);
    assert(fake.calls.some((call) => call.field === "properNames" && call.text === "明光"));
    assert.equal(fake.calls.filter((call) => call.target === 1093683505).length, 6);
    manager.destroy();
});
test("非英雄、移除物品與不相符的類型不套用專有名稱", () => {
    const s = service();
    const fake = fakeNatives();
    fake.natives.isHero = () => false;
    fake.natives.itemType = () => 0;
    const manager = createObjectText(s, fixtureData(), fake.natives);
    manager.trackUnit({} as unit);
    manager.trackItem({} as item);
    assert.equal(fake.calls.filter((call) => call.field === "properNames").length, 0);
    fake.natives.unitType = () => 0;
    fake.calls.length = 0;
    s.language.set("en-US");
    assert.equal(fake.calls.length, 2);
    manager.destroy();
});
