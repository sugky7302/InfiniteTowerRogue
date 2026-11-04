import { test } from "node:test";
import { strict as assert } from "node:assert";
import { SaveField } from "@features/save";
import { recordField, recordRegistry, recordRow, recordsCases } from "./records-cases";

for (const entry of recordsCases) {
    const current = entry;
    test(current.name, () => current.run());
}
for (const maxLength of [0, -1, 257, 1.5, NaN]) {
    test(`紀錄登錄拒絕最大數量 ${maxLength}`, () => {
        assert.throws(() => recordRegistry({ ...recordField, maxLength } as SaveField));
    });
}
for (const fields of [
    [],
    [{ name: "", kind: "boolean" }],
    [
        { name: "a", kind: "boolean" },
        { name: "a", kind: "boolean" },
    ],
    [{ name: "a", kind: "uint", min: -1, max: 1 }],
    [{ name: "a", kind: "uint", min: 0, max: 16777216 }],
    [{ name: "a", kind: "list", min: 0, max: 1, length: 257 }],
    [{ name: "a", kind: "dependent-list", min: 0, max: 1, lengthFrom: "missing", lengths: [1] }],
    [
        { name: "tier", kind: "uint", min: 1, max: 2 },
        {
            name: "a",
            kind: "dependent-list",
            min: 0,
            max: 1,
            lengthFrom: "tier",
            lengths: [1, 1, 1],
        },
    ],
    [
        { name: "tier", kind: "uint", min: 0, max: 1 },
        { name: "a", kind: "dependent-list", min: 0, max: 1, lengthFrom: "tier", lengths: [1] },
    ],
    [
        { name: "tier", kind: "uint", min: 0, max: 1 },
        { name: "a", kind: "dependent-list", min: 0, max: 1, lengthFrom: "tier", lengths: [1, -1] },
    ],
] as const) {
    const definitions = fields;
    test(`紀錄登錄拒絕無效欄位 ${JSON.stringify(definitions)}`, () => {
        assert.throws(() =>
            recordRegistry({ name: "rows", kind: "records", maxLength: 1, fields: definitions }),
        );
    });
}
test("紀錄格式超過打包上限時在登錄階段拒絕", () => {
    assert.throws(() => recordRegistry({ ...recordField, maxLength: 256 } as SaveField));
});
test("紀錄清單拒絕空物件值與稀疏紀錄", () => {
    const registry = recordRegistry();
    for (const rows of [[null], new Array(1)])
        assert.equal(
            registry.pack({ s: { rows } } as unknown as import("@features/save").SaveData, 1),
            undefined,
        );
});
test("紀錄打包與解包經 NumberAudit 檢查 int32 與 float32", () => {
    let count = 0;
    const audit = (value: number): void => {
        assert.ok(Number.isInteger(value) && value >= 0 && value <= 2147483647);
        assert.equal(Math.fround(value), value);
        count++;
    };
    const registry = recordRegistry();
    const data = { s: { rows: [recordRow(1), recordRow(2), recordRow(3)] } };
    assert.deepEqual(registry.unpack(registry.pack(data, 1, audit)!, 1, audit), data);
    assert.ok(count > 100);
});
