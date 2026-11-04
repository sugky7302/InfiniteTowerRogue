import { test } from "node:test";
import { strict as assert } from "node:assert";
import { ObjectData } from "war3-objectdata-th/dist/cjs";
import { nativeItemTypes, nativeItemIcons, nativeItemNames } from "@features/equipment";
import { itemBases } from "@entities/item";
const { createInventoryObjects } = require("../../scripts/inventory-objects.cjs");
const config = { nativeItemTypes, nativeItemIcons, nativeItemNames };
test("每個物品基底產生一般永久類別，沒有技能或使用效果", () => {
    const data = new ObjectData();
    createInventoryObjects(data, config);
    const loaded = new ObjectData();
    loaded.load(data.save());
    assert.equal(Object.keys(nativeItemTypes).length, itemBases.length);
    for (const base of itemBases) {
        const value = loaded.items.get(nativeItemTypes[base.id as keyof typeof nativeItemTypes])!;
        assert.equal(value.classification, "Permanent");
        assert.equal(value.abilities, "");
        assert.equal(value.activelyUsed, false);
        assert.equal(value.useAutomaticallyWhenAcquired, false);
        assert.equal(value.canBeDropped, true);
        assert.equal(value.numberOfCharges, 0);
        assert.equal(value.goldCost, 0);
        assert.equal(value.interfaceIcon, nativeItemIcons[base.id]);
    }
});
test("物品代碼與其他物件衝突時在修改前拒絕", () => {
    for (const collection of ["items", "units", "abilities"] as const) {
        const data = new ObjectData();
        const old = collection === "items" ? "ratf" : collection === "units" ? "hfoo" : "AInv";
        data[collection].copy(old, "I0B3");
        assert.throws(() => createInventoryObjects(data, config), /代碼已被使用/);
        assert.equal(data.items.has("I0B1"), false);
    }
});
test("物品代碼重複時拒絕", () => {
    assert.throws(
        () =>
            createInventoryObjects(new ObjectData(), {
                ...config,
                nativeItemTypes: { ...nativeItemTypes, "rune-staff": "I0B2" },
            }),
        /代碼重複/,
    );
});
