import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
    SaveCodec,
    compactCode,
    createDemoRegistry,
    MAX_PACKED_BYTES,
    MAX_SAVE_CODE_LENGTH,
} from "@features/save";
import { createHeroSaveParticipants } from "../../src/app/hero-save";
import { inventoryCases, inventoryData, worstInventoryData } from "./cases";

for (const entry of inventoryCases) {
    const current = entry;
    test(current.name, () => current.run());
}
test("版本四94筆最壞資料經 NumberAudit 檢查 int32 與 float32", () => {
    let count = 0;
    const registry = createDemoRegistry(createHeroSaveParticipants({} as player));
    const codec = new SaveCodec(registry, 4, (value) => {
        assert.ok(Number.isInteger(value) && value >= 0 && value <= 2147483647);
        assert.equal(Math.fround(value), value);
        count++;
    });
    const data = worstInventoryData();
    const code = codec.encode(data, "玩家Alice")!;
    assert.deepEqual(codec.decode(code, "玩家Alice"), data);
    assert.equal(registry.pack(data, 4)!.length, 710);
    assert.equal(code.length, 1397);
    assert.equal(compactCode(code).length, 1165);
    assert.ok(code.length <= MAX_SAVE_CODE_LENGTH && 710 <= MAX_PACKED_BYTES && count > 10000);
});
test("版本四碼長計算固定", () => {
    const codec = new SaveCodec(createDemoRegistry(createHeroSaveParticipants({} as player)), 4);
    for (const [data, packed, compact, grouped] of [
        [inventoryData(), 23, 66, 79],
        [inventoryData(12), 62, 128, 153],
        [worstInventoryData(), 710, 1165, 1397],
    ] as const) {
        const code = codec.encode(data, "Alice")!;
        assert.equal(
            createDemoRegistry(createHeroSaveParticipants({} as player)).pack(data, 4)!.length,
            packed,
        );
        assert.equal(compactCode(code).length, compact);
        assert.equal(code.length, grouped);
    }
});
