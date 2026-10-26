import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    createLocalFileIo,
    encodeFileData,
    decodeFileData,
    maxFileDataLength,
} from "../../src/shared/file-io";
import {
    encodeLanguagePreference,
    decodeLanguagePreference,
    languagePreferencePath,
} from "../../src/shared/i18n/preference";
import { createI18n } from "../../src/shared/i18n/translation";
import { installLanguageChat } from "../../src/shared/i18n/chat";
import { Subject } from "../../src/shared/rxwc3/core/subject";
import { ChatEvent } from "../../src/shared/wc3-def/events";
import { FakeSyncNetwork } from "../rxwc3/fake-sync-natives";
import { wc3FileIoNatives } from "../../src/shared/wc3-def/wc3-file-io-natives";
import { fakeFileIo } from "./fake-file-io";
import { verifyFileIo } from "./file-io-lua.spec";

test("本地檔案在 Node 執行十組 Lua 共用流程", () => assert.equal(verifyFileIo(), 10));
test("三種偏好語言均可編碼與解碼", () => {
    for (const code of ["zh-TW", "zh-CN", "en-US"] as const)
        assert.equal(decodeLanguagePreference(encodeLanguagePreference(code)), code);
});
test("偏好拒絕其他版本、尾隨文字、錯誤大小寫與空白", () => {
    for (const value of [
        "",
        "en-US",
        "ITR-LANG-2:en-US",
        "ITR-LANG-1:en-us",
        "ITR-LANG-1:en-US ",
        "ITR-LANG-1:en-US\n",
    ]) {
        assert.equal(decodeLanguagePreference(value), undefined);
    }
});
test("檔案資料支援空字串、分隔符號與長內容", () => {
    for (const value of ["", "ABC|[]:'-_/", "Z".repeat(maxFileDataLength)])
        assert.equal(decodeFileData(encodeFileData(value)!), value);
});
test("檔案資料拒絕注入字元、中文與長度超限", () => {
    for (const value of ['"', "\\", "\n", "\r", "\0", "甲", "Z".repeat(maxFileDataLength + 1)])
        assert.equal(encodeFileData(value), undefined);
});
test("檔案資料拒絕錯誤長度、檢查碼與多餘內容", () => {
    const valid = encodeFileData("ABCD")!;
    for (const value of [
        valid.slice(1),
        valid + "0",
        valid.replace("ABCD", "ABCE"),
        valid.replace("|4|", "|04|"),
        "ITF1|-1|A|65",
        "ITF1|9999999999999999|A|65",
    ]) {
        assert.equal(decodeFileData(value), undefined);
    }
});
test("檢查碼在 32 位元整數與浮點數中保持精確", () => {
    let checksum = 0;
    for (let i = 0; i < maxFileDataLength; i++) {
        const middle = checksum * 31 + 126;
        assert(middle <= 2147483647);
        assert.equal(Math.fround(middle), middle);
        checksum = middle % 65521;
    }
    assert(encodeFileData("~".repeat(maxFileDataLength))!.endsWith("|" + checksum));
});
test("不存在的偏好使用用戶端語言，其他語言使用正體", () => {
    const files = createLocalFileIo(fakeFileIo().natives);
    for (const [raw, expected] of [
        ["zhTW", "zh-TW"],
        ["enUS", "en-US"],
        ["zhCN", "zh-CN"],
        ["deDE", "zh-TW"],
    ]) {
        assert.equal(createI18n({ getLocale: () => raw }, files).language(), expected);
    }
});
test("有效檔案框架內的錯誤偏好使用用戶端語言", () => {
    const fake = fakeFileIo();
    fake.files.set(languagePreferencePath, encodeFileData("ITR-LANG-1:frFR")!);
    const service = createI18n({ getLocale: () => "zhCN" }, createLocalFileIo(fake.natives));
    assert.equal(service.language(), "zh-CN");
    assert.equal(service.preference?.result.status, "內容錯誤");
});
test("讀取成功、損壞與例外均恢復技能提示，不重新建立資源", () => {
    const fake = fakeFileIo(),
        files = createLocalFileIo(fake.natives);
    fake.files.set("test.pld", encodeFileData("ABC")!);
    assert.deepEqual(files.read("test.pld"), { status: "已讀取", data: "ABC" });
    fake.files.set("test.pld", "錯誤");
    assert.equal(files.read("test.pld").status, "內容錯誤");
    fake.failRead(true);
    assert.equal(files.read("test.pld").status, "讀取失敗");
    assert.equal(fake.getTooltip(), "原始提示");
    assert.equal(fake.prepares(), 1);
});
test("寫入最長資料時每段低於 200 位元組且使用合法 JASS 結尾", () => {
    const fake = fakeFileIo();
    const emitted: string[] = [];
    const emit = fake.natives.emit;
    fake.natives.emit = (line) => {
        emitted.push(line);
        emit(line);
    };
    const files = createLocalFileIo(fake.natives);
    const payload = "A".repeat(maxFileDataLength);
    assert.equal(files.write("slot.pld", payload).status, "已送出，尚未確認磁碟寫入");
    assert(emitted.every((line) => Buffer.byteLength(line) < 200));
    assert(emitted[0].includes("call BlzSetAbilityTooltip('A0IO',\"ITF1|"));
    assert(emitted.at(-1)!.includes("endfunction\nfunction a takes nothing returns nothing"));
    assert.deepEqual(files.read("slot.pld"), { status: "已讀取", data: payload });
    assert.equal(fake.lines.length, 0);
});
test("寫入原生函式失敗時清空緩衝並回報失敗", () => {
    const fake = fakeFileIo(),
        files = createLocalFileIo(fake.natives);
    fake.failWrite(true);
    assert.equal(files.write("slot.pld", "ABC").status, "寫入失敗");
    assert.deepEqual(fake.lines, []);
    assert.equal(fake.writes(), 0);
});
test("讀寫拒絕絕對路徑與路徑穿越", () => {
    const fake = fakeFileIo(),
        files = createLocalFileIo(fake.natives);
    for (const value of [
        "",
        "..\\bad",
        "a\\..\\bad",
        "C:\\bad",
        "\\bad",
        "a/b",
        "a\\\\b",
        "bad\n",
    ]) {
        assert.equal(files.read(value).status, "路徑錯誤");
        assert.equal(files.write(value, "ABC").status, "路徑錯誤");
    }
    assert.equal(fake.writes(), 0);
});
test("聊天只在輸入者的用戶端寫檔且不傳送同步封包", () => {
    const network = new FakeSyncNetwork(),
        chat = new Subject<ChatEvent>();
    const fakes = [fakeFileIo(), fakeFileIo()];
    const services = fakes.map((fake) =>
        createI18n({ getLocale: () => "zhTW" }, createLocalFileIo(fake.natives)),
    );
    const messages: string[] = [];
    const owners = services.map((service, id) =>
        installLanguageChat(
            service,
            chat,
            network.players,
            (text) => {
                messages.push(text);
            },
            network.client(id),
        ),
    );
    try {
        chat.next({ player: network.players[0], message: "-lang en-US" });
        assert.equal(fakes[0].writes(), 1);
        assert.equal(fakes[1].writes(), 0);
        assert.equal(services[0].language(), "en-US");
        assert.equal(services[1].language(), "zh-TW");
        assert(messages.some((text) => text.includes("尚未確認磁碟寫入")));
        chat.next({ player: network.players[0], message: "-lang en-US" });
        assert.equal(fakes[0].writes(), 2);
        chat.next({ player: network.players[1], message: "-lang invalid" });
        assert.equal(fakes[1].writes(), 0);
        assert.equal(network.packets.length, 0);
        assert(fakes.every((fake) => fake.prepares() === 1));
    } finally {
        owners.forEach((owner) => owner.unsubscribe());
    }
});
test("寫檔失敗仍套用本地語言並輸出結果", () => {
    const fake = fakeFileIo(),
        files = createLocalFileIo(fake.natives);
    fake.failWrite(true);
    const service = createI18n({ getLocale: () => "zhTW" }, files);
    assert.equal(service.selectLanguage("en-US")?.status, "寫入失敗");
    assert.equal(service.language(), "en-US");
});
test("正式介面只在 prepare 建立載入資源，讀寫只呼叫預載與文字原生函式", () => {
    const calls: [string, unknown[]][] = [];
    const names = [
        "CreateUnit",
        "Player",
        "FourCC",
        "ShowUnit",
        "UnitAddAbility",
        "RemoveUnit",
        "BlzGetAbilityTooltip",
        "BlzSetAbilityTooltip",
        "PreloadGenClear",
        "PreloadGenStart",
        "Preload",
        "PreloadGenEnd",
        "Preloader",
        "PLAYER_NEUTRAL_PASSIVE",
    ];
    const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    const globals = globalThis as any;
    try {
        let tooltip = "原始提示";
        for (const name of names)
            globals[name] = (...args: unknown[]) => {
                calls.push([name, args]);
                return {};
            };
        globals.PLAYER_NEUTRAL_PASSIVE = 27;
        globals.BlzGetAbilityTooltip = (...args: unknown[]) => {
            calls.push(["BlzGetAbilityTooltip", args]);
            return tooltip;
        };
        globals.BlzSetAbilityTooltip = (...args: unknown[]) => {
            calls.push(["BlzSetAbilityTooltip", args]);
            tooltip = args[1] as string;
        };
        const files = createLocalFileIo(wc3FileIoNatives);
        assert.equal(calls.filter(([name]) => name === "CreateUnit").length, 1);
        assert.equal(calls.filter(([name]) => name === "RemoveUnit").length, 1);
        calls.length = 0;
        files.read("slot.pld");
        files.write("slot.pld", "ABC");
        assert(!calls.some(([name]) => name === "CreateUnit" || name === "UnitAddAbility"));
        assert(
            calls.some(
                ([name, args]) =>
                    name === "Preloader" && args.length === 1 && args[0] === "slot.pld",
            ),
        );
        assert(
            calls.some(
                ([name, args]) =>
                    name === "PreloadGenEnd" && args.length === 1 && args[0] === "slot.pld",
            ),
        );
        assert(
            calls
                .filter(([name]) => name === "BlzSetAbilityTooltip")
                .every(([, args]) => args.length === 3 && args[2] === 0),
        );
        assert.equal(tooltip, "ITF-IDLE");
    } finally {
        names.forEach((name, index) => {
            const descriptor = saved[index];
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globals[name];
        });
    }
});
