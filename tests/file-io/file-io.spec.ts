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
import { ChatEvent, wc3FileNatives } from "@shared/wc3-def";
import { FakeSyncNetwork } from "../rxwc3/fake-sync-natives";
import { fakeFileIo } from "./fake-file-io";
import { fileAbility, filePreloadStart, filePreloadEnd } from "../../src/shared/file-io";
import { verifyFileIo } from "./file-io-lua.spec";

test("本地檔案在 Node 執行二十八組 Lua 共用流程", () => assert.equal(verifyFileIo(), 28));
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
    fake.setData(languagePreferencePath, encodeFileData("ITR-LANG-1:frFR")!);
    const service = createI18n({ getLocale: () => "zhCN" }, createLocalFileIo(fake.natives));
    assert.equal(service.language(), "zh-CN");
    assert.equal(service.preference?.result.status, "內容錯誤");
});
test("讀取成功、損壞與例外均恢復技能圖示", () => {
    const fake = fakeFileIo(),
        files = createLocalFileIo(fake.natives);
    fake.setData("test.pld", encodeFileData("ABC")!);
    assert.deepEqual(files.read("test.pld"), { status: "已讀取", data: "ABC" });
    fake.setData("test.pld", "錯誤");
    assert.equal(files.read("test.pld").status, "內容錯誤");
    fake.failRead(true);
    assert.equal(files.read("test.pld").status, "讀取失敗");
    assert.equal(fake.getIcon(), "原始圖示");
});
test("寫入最長資料時每段至多 259 字元且使用內嵌 Lua", () => {
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
    assert(emitted.every((line) => Buffer.byteLength(line) <= 259));
    assert.equal(emitted[0], filePreloadStart);
    assert.equal(emitted.at(-1), filePreloadEnd);
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
test("正式介面只呼叫圖示與預載原生函式", () => {
    const calls: [string, unknown[]][] = [];
    const names = [
        "BlzGetAbilityIcon",
        "BlzSetAbilityIcon",
        "PreloadGenClear",
        "PreloadGenStart",
        "Preload",
        "PreloadGenEnd",
        "Preloader",
        "CreateUnit",
        "UnitAddAbility",
    ];
    const saved = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    const globals = globalThis as any;
    let icon = "原始圖示";
    try {
        for (const name of names)
            globals[name] = (...args: unknown[]) => {
                calls.push([name, args]);
            };
        globals.BlzGetAbilityIcon = (...args: unknown[]) => {
            calls.push(["BlzGetAbilityIcon", args]);
            return icon;
        };
        globals.BlzSetAbilityIcon = (...args: unknown[]) => {
            calls.push(["BlzSetAbilityIcon", args]);
            icon = args[1] as string;
        };
        const files = createLocalFileIo(wc3FileNatives);
        assert.equal(calls.length, 0);
        assert.equal(files.read("slot.pld").status, "沒有檔案或無法讀取");
        files.write("slot.pld", "ABC");
        assert.equal(icon, "原始圖示");
        assert(!calls.some(([name]) => name === "CreateUnit" || name === "UnitAddAbility"));
        for (const name of ["Preloader", "PreloadGenEnd"])
            assert(
                calls.some(
                    ([called, args]) =>
                        called === name && args.length === 1 && args[0] === "slot.pld",
                ),
            );
        assert(
            calls
                .filter(([name]) => name === "BlzGetAbilityIcon")
                .every(([, args]) => args.length === 1 && args[0] === fileAbility),
        );
        assert(
            calls
                .filter(([name]) => name === "BlzSetAbilityIcon")
                .every(([, args]) => args.length === 2 && args[0] === fileAbility),
        );
    } finally {
        names.forEach((name, index) => {
            const descriptor = saved[index];
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globals[name];
        });
    }
});
