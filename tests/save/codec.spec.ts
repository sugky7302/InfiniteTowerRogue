import { strict as assert } from "node:assert";
import { createHash, createHmac } from "node:crypto";
import { test } from "node:test";
import {
    SaveCodec,
    compactCode,
    decodeBase32,
    encodeBase32,
    maxSaveCodeLength,
    normalizePlayerName,
    saveAlphabet,
    SaveRegistry,
    SaveData,
    maxPackedBytes,
    createDemoRegistry,
    createDemoCodec,
    initialDemoData,
    sha256,
    hmac256,
    utf8,
} from "@features/save";
import { encodeFileData } from "../../src/shared/file-io";
import { verifySave } from "./basic-lua.spec";

test("存檔在 Node 執行十組 Lua 共用流程", () => assert.equal(verifySave(), 10));
for (const length of [0, 1, 55, 56, 63, 64, 65, 255, 1024]) {
    test(`SHA 與 HMAC 比對 Node 標準實作，輸入長度 ${length}`, () => {
        const bytes = Array.from({ length }, (_, index) => index % 256);
        const key = Array.from({ length: 80 }, (_, index) => index);
        assert.equal(
            Buffer.from(sha256(bytes)).toString("hex"),
            createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
        );
        assert.equal(
            Buffer.from(hmac256(key, bytes)).toString("hex"),
            createHmac("sha256", Buffer.from(key)).update(Buffer.from(bytes)).digest("hex"),
        );
    });
}
for (const level of [1, 100])
    for (const gold of [0, 1000000])
        for (const item of [0, 3]) {
            test(`全部欄位邊界往返，等級 ${level}，金錢 ${gold}，物品 ${item}`, () => {
                const codec = createDemoCodec();
                const data = { demo: { level, gold, items: [item, item, item, item, item, item] } };
                assert.deepEqual(codec.decode(codec.encode(data, "Alice")!, "Alice"), data);
            });
        }
test("每一個有效字元的所有不同 Base32 字元均使存檔無效", () => {
    const codec = createDemoCodec();
    const code = compactCode(codec.encode(initialDemoData(), "Alice")!);
    for (let index = 0; index < code.length; index++)
        for (const char of saveAlphabet) {
            if (char !== code[index])
                assert.equal(
                    codec.decode(code.slice(0, index) + char + code.slice(index + 1), "Alice"),
                    undefined,
                );
        }
});
test("位元組竄改、截斷、附加、其他玩家及標籤不符均無效", () => {
    const codec = createDemoCodec();
    const code = codec.encode(initialDemoData(), "Alice#1234")!;
    const bytes = decodeBase32(code)!;
    for (let index = 0; index < bytes.length; index++) {
        const changed = [...bytes];
        changed[index] ^= 1;
        assert.equal(codec.decode(encodeBase32(changed), "Alice#1234"), undefined);
    }
    for (const bad of [
        code.slice(1),
        code + "0",
        "",
        "U",
        "?",
        "中",
        "0".repeat(maxSaveCodeLength + 1),
    ])
        assert.equal(codec.decode(bad, "Alice#1234"), undefined);
    for (const name of ["Bob#1234", "Alice#1235", "A".repeat(257)])
        assert.equal(codec.decode(code, name), undefined);
});
test("分組、空白、大小寫及 O、I、L 別名一致", () => {
    const codec = createDemoCodec();
    const data = initialDemoData();
    const code = codec.encode(data, " alice#1234\t")!;
    for (const one of ["i", "l"]) {
        const alias = compactCode(code).toLowerCase().replaceAll("0", "o").replaceAll("1", one);
        assert.deepEqual(
            codec.decode(" \n" + alias.split("").join("-\t") + "\r", "ALICE#1234"),
            data,
        );
    }
    assert.equal(normalizePlayerName(" \t玩家Alice#1234\r\n"), "玩家ALICE#1234");
    assert.equal(codec.decode(code, "ſlice#1234"), undefined);
});
test("每個物品位置可獨立保存全部目錄索引", () => {
    const codec = createDemoCodec();
    for (let slot = 0; slot < 6; slot++)
        for (let item = 0; item < 4; item++) {
            const data = initialDemoData();
            (data.demo.items as number[])[slot] = item;
            assert.deepEqual(codec.decode(codec.encode(data, "Alice")!, "Alice"), data);
        }
});
test("資料型別、整數、數值範圍、清單長度及缺少欄位均受檢查", () => {
    const codec = createDemoCodec();
    for (const [field, value] of [
        ["level", 0],
        ["level", 101],
        ["level", 1.5],
        ["gold", -1],
        ["gold", 1000001],
        ["gold", NaN],
        ["level", true],
        ["items", [0]],
        ["items", [0, 0, 0, 0, 0, 4]],
    ] as const) {
        const data = initialDemoData();
        data.demo[field] = value as any;
        assert.equal(codec.encode(data, "Alice"), undefined);
    }
    assert.equal(codec.encode({}, "Alice"), undefined);
});
test("舊版依序轉換，未來版本及缺少轉換函式均拒絕", () => {
    const registry = createDemoRegistry();
    const legacy = new SaveCodec(registry, 1);
    const current = new SaveCodec(registry, 2);
    const old = legacy.encode({ demo: { level: 100, gold: 65535, items: [1, 2, 3] } }, "Alice")!;
    assert.deepEqual(current.decode(old, "Alice"), {
        demo: { level: 100, gold: 65535, items: [1, 2, 3, 0, 0, 0] },
    });
    assert.equal(legacy.decode(current.encode(initialDemoData(), "Alice")!, "Alice"), undefined);
    const missing = new SaveRegistry()
        .register({ version: 1, sections: [] })
        .register({ version: 2, sections: [] });
    assert.equal(
        new SaveCodec(missing, 2).decode(new SaveCodec(missing, 1).encode({}, "Alice")!, "Alice"),
        undefined,
    );
    const chained = new SaveRegistry();
    for (const version of [1, 2, 3])
        chained.register({ version, sections: [], migrate: (data) => data });
    assert.deepEqual(
        new SaveCodec(chained, 3).decode(new SaveCodec(chained, 1).encode({}, "Alice")!, "Alice"),
        {},
    );
});
test("登錄新區段支援布林、固定清單與 24 位元無號整數", () => {
    const registry = new SaveRegistry().register({
        version: 1,
        sections: [
            {
                name: "next",
                fields: [
                    { name: "flag", kind: "boolean" },
                    { name: "value", kind: "uint", min: 0, max: 16777215 },
                    { name: "fixed", kind: "list", min: 5, max: 5, length: 3 },
                ],
            },
        ],
    });
    const codec = new SaveCodec(registry, 1);
    for (const flag of [false, true])
        for (const value of [0, 16777215]) {
            const data = { next: { flag, value, fixed: [5, 5, 5] } };
            assert.deepEqual(codec.decode(codec.encode(data, "Alice")!, "Alice"), data);
        }
});
test("登錄拒絕重複版本、區段、欄位及超長格式", () => {
    const registry = new SaveRegistry().register({ version: 1, sections: [] });
    assert.throws(() => registry.register({ version: 1, sections: [] }));
    for (const sections of [
        [
            { name: "a", fields: [] },
            { name: "a", fields: [] },
        ],
        [
            {
                name: "a",
                fields: [
                    { name: "x", kind: "boolean" },
                    { name: "x", kind: "boolean" },
                ],
            },
        ],
        [{ name: "a", fields: [{ name: "x", kind: "list", min: 0, max: 16777215, length: 256 }] }],
        [{ name: "a", fields: [{ name: "x", kind: "uint", min: 0, max: 2147483647 }] }],
    ])
        assert.throws(() => new SaveRegistry().register({ version: 1, sections: sections as any }));
});
test("編碼器保存格式快照，後續登錄不改變既有編碼器", () => {
    const registry = new SaveRegistry().register({ version: 1, sections: [] });
    const codec = new SaveCodec(registry, 2);
    registry.register({ version: 2, sections: [] });
    assert.equal(codec.encode({}, "Alice"), undefined);
});
test("打包拒絕未知版本、額外位元組、非零填充與越界位元值", () => {
    const registry = createDemoRegistry();
    const packed = registry.pack(initialDemoData(), 2)!;
    assert.equal(registry.unpack([3, ...packed.slice(1)], 2), undefined);
    assert.equal(registry.unpack([...packed, 0], 2), undefined);
    const bad = [...packed];
    bad[bad.length - 1] |= 1;
    assert.equal(registry.unpack(bad, 2), undefined);
    const small = new SaveRegistry().register({
        version: 1,
        sections: [{ name: "s", fields: [{ name: "x", kind: "uint", min: 0, max: 5 }] }],
    });
    assert.equal(small.unpack([1, 224], 1), undefined);
});
test("Base32 往返全部位元組並拒絕非標準長度與填充", () => {
    const bytes = Array.from({ length: 256 }, (_, index) => index);
    assert.deepEqual(decodeBase32(encodeBase32(bytes)), bytes);
    for (const code of ["0", "000", "01", "000001", "中", "U"])
        assert.equal(decodeBase32(code), undefined);
});
test("存檔碼及最長打包結果符合 file-io 字元與長度限制", () => {
    const registry = new SaveRegistry().register({
        version: 1,
        sections: [
            {
                name: "s",
                fields: [
                    { name: "a", kind: "list", min: 0, max: 255, length: 256 },
                    { name: "b", kind: "list", min: 0, max: 255, length: 255 },
                ],
            },
        ],
    });
    const data = { s: { a: Array(256).fill(255), b: Array(255).fill(255) } };
    assert.equal(registry.pack(data, 1)!.length, maxPackedBytes);
    const code = new SaveCodec(registry, 1).encode(data, "Alice")!;
    assert(code.length <= maxSaveCodeLength);
    assert(encodeFileData(code));
    assert.deepEqual(new SaveCodec(registry, 1).decode(code, "Alice"), data);
});
test("實際雜湊算術與編碼邊界符合 int32 及 float32", () => {
    let checks = 0;
    const audit = (value: number): void => {
        assert(Number.isInteger(value) && value >= 0 && value <= 2147483647);
        assert.equal(Math.fround(value), value);
        checks++;
    };
    const codec = new SaveCodec(createDemoRegistry(), 2, audit);
    const data: SaveData = { demo: { level: 100, gold: 1000000, items: [3, 3, 3, 3, 3, 3] } };
    assert.deepEqual(codec.decode(codec.encode(data, "玩家😀#9999")!, "玩家😀#9999"), data);
    hmac256(Array(80).fill(255), Array(1024).fill(255), audit);
    for (let shift = 1; shift < 16; shift++) {
        const moved = (65535 & ((1 << shift) - 1)) << (16 - shift);
        audit(moved);
    }
    audit(16777215);
    audit(4095);
    audit(maxPackedBytes * 8);
    assert(checks > 10000);
});

test("格式版本與密鑰版本位於存檔碼開頭，任一版本竄改均無效", () => {
    const codec = createDemoCodec();
    const bytes = decodeBase32(codec.encode(initialDemoData(), "Alice")!)!;
    assert.deepEqual(bytes.slice(0, 2), [2, 1]);
    for (const index of [0, 1]) {
        const changed = [...bytes];
        changed[index] = 3;
        assert.equal(codec.decode(encodeBase32(changed), "Alice"), undefined);
    }
});
test("轉換例外與轉換後的無效資料均只回傳無效", () => {
    for (const migrate of [
        () => {
            throw new Error("預期的轉換錯誤。");
        },
        () => ({ s: { value: 2 } }),
    ]) {
        const registry = new SaveRegistry()
            .register({ version: 1, sections: [], migrate })
            .register({
                version: 2,
                sections: [{ name: "s", fields: [{ name: "value", kind: "boolean" }] }],
            });
        const code = new SaveCodec(registry, 1).encode({}, "Alice")!;
        assert.equal(new SaveCodec(registry, 2).decode(code, "Alice"), undefined);
    }
});
test("24 位元範圍的實際打包與解包接受 float32 稽核", () => {
    const audit = (value: number): void => {
        assert(value <= 2147483647);
        assert.equal(Math.fround(value), value);
    };
    const registry = new SaveRegistry().register({
        version: 1,
        sections: [{ name: "s", fields: [{ name: "value", kind: "uint", min: 0, max: 16777215 }] }],
    });
    const codec = new SaveCodec(registry, 1, audit);
    for (const value of [0, 8388607, 8388608, 16777215]) {
        const data = { s: { value } };
        assert.deepEqual(codec.decode(codec.encode(data, "Alice")!, "Alice"), data);
    }
});
