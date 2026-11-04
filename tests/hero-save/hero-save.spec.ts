import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createDemoRegistry, SaveCodec, compactCode } from "@features/save";
import { createHeroSaveParticipants, decodeHeroSave } from "../../src/app/hero-save";
import { heroSaveCases, saveData } from "./cases";

for (const entry of heroSaveCases) {
    const item = entry;
    test(item.name, () => item.run());
}
test("英雄版本三經 NumberAudit 檢查整數與 float32", () => {
    let count = 0;
    const codec = new SaveCodec(
        createDemoRegistry(createHeroSaveParticipants({} as player)),
        3,
        (value) => {
            assert.ok(Number.isInteger(value) && value >= 0 && value <= 2147483647);
            assert.equal(Math.fround(value), value);
            count++;
        },
    );
    for (const full of [false, true]) {
        const data = saveData(full);
        const code = codec.encode(data, "玩家Alice")!;
        assert.deepEqual(codec.decode(code, "玩家Alice"), data);
        assert.ok(decodeHeroSave(data)?.present);
        assert.equal(code.length, 265);
        assert.equal(compactCode(code).length, 221);
    }
    assert.ok(count > 10000);
});
