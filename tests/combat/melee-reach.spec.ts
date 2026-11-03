import { strict as assert } from "node:assert";
import { test } from "node:test";
import { meleeReach } from "@entities/combat";

const input = {
    distance: 0,
    attackRange: 100,
    attackerCollision: 16,
    targetCollision: 24,
    tolerance: 32,
};
for (const [distance, hit] of [
    [171.99, true],
    [172, true],
    [172.01, false],
] as const) {
    test(`近戰中心距離 ${distance} 的判定為 ${hit ? "命中" : "閃避"}`, () => {
        assert.deepEqual(meleeReach({ ...input, distance: Math.fround(distance) }, Math.fround), {
            limit: 172,
            hit,
        });
    });
}
test("近戰判定包含雙方碰撞與零容許值，且不修改輸入", () => {
    const value = { ...input, tolerance: 0, distance: 140 };
    const before = { ...value };
    assert.deepEqual(meleeReach(value), { limit: 140, hit: true });
    assert.deepEqual(value, before);
    assert.deepEqual(
        meleeReach({
            distance: 0,
            attackRange: 0,
            attackerCollision: 0,
            targetCollision: 0,
            tolerance: 0,
        }),
        { limit: 0, hit: true },
    );
});
test("近戰判定拒絕負值、非有限值與超過 int32 的中間值", () => {
    for (const key of Object.keys(input)) {
        for (const value of [-1, NaN, Infinity, 2147483647])
            assert.throws(() => meleeReach({ ...input, [key]: value }, Math.fround));
    }
    assert.throws(() =>
        meleeReach({ ...input, attackRange: 2147483520, tolerance: 512 }, Math.fround),
    );
});
test("近戰判定的 float32 中間值符合 int32 上限", () => {
    const values: number[] = [];
    meleeReach(input, (value) => {
        const rounded = Math.fround(value);
        assert.ok(Math.abs(value) <= 2147483647 && Math.abs(rounded) <= 2147483647);
        values.push(rounded);
        return rounded;
    });
    assert.deepEqual(values, [116, 140, 172]);
});
