import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DamageStat, settleDamage, resolveDamage, generalCheckValue } from "@entities/combat";
import { combatCases } from "./basic-lua.spec";
import { flameInput, simpleInput, part } from "./fixtures";

for (const item of combatCases) {
    test(item.name, () =>
        item.run((value) => {
            assert.ok(Number.isFinite(value) && Math.abs(value) <= 2147483647);
            const rounded = Math.fround(value);
            assert.ok(Number.isFinite(rounded) && Math.abs(rounded) <= 2147483647);
            return rounded;
        }),
    );
}

test("結算不修改輸入與之前的步驟快照", () => {
    const input = flameInput();
    const before = JSON.stringify(input);
    const result = settleDamage(input);
    assert.equal(JSON.stringify(input), before);
    assert.equal(result.trace[0].state.parts[0].amount, 80);
    assert.equal(result.trace[3].state.parts[0].amount, 100);
    assert.equal(result.trace[12].state.shields[0].capacity, 0);
    assert.equal(result.trace[11].state.shields[0].capacity, 50);
});

test("拒絕無法安全表示的數值與算術中間值", () => {
    for (const amount of [NaN, Infinity, -Infinity, 2147483647]) {
        assert.throws(() => settleDamage(simpleInput(amount)));
    }
    const input = simpleInput();
    const formula = (power: number, coefficient: number) => ({
        ...input,
        event: { ...input.event, parts: [{ ...part(0), power, coefficient }] },
    });
    assert.throws(() => settleDamage(formula(1000000, 1000000)));
    assert.throws(() =>
        generalCheckValue({
            challenge: 2147483520,
            adverse: 0,
            level: 0,
            attribute: 0,
            favorable: 0,
        }),
    );
    assert.equal(settleDamage(formula(40000, 40000)).trace[3].state.parts[0].amount, 1600000000);
});

test("相容包裝保留零傷害、負基礎值與超過試玩生命的傷害", () => {
    const target = { defense: 0, resistance: 0, shield: 0 };
    assert.equal(resolveDamage(-100, 0, 0, target).life, 0);
    assert.equal(resolveDamage(-10, 20, 1, target).life, 10);
    assert.equal(resolveDamage(200000, 0, 0, target).life, 200000);
});

test("最大生命百分比不得搭配無視減傷", () => {
    const input = simpleInput();
    assert.throws(() =>
        settleDamage({
            ...input,
            event: {
                ...input.event,
                healthDamage: { basis: "maximum", rate: 0.1, remaining: 100 },
                ignoreReduction: ["defense"],
            },
        }),
    );
});

test("分攤拒絕原目標及重複承受者", () => {
    const input = simpleInput();
    assert.throws(() =>
        settleDamage({
            ...input,
            shares: [{ target: input.event.target, rate: 0.5, state: input.target }],
        }),
    );
    const share = { target: "guardian", rate: 0.5, state: input.target };
    assert.throws(() => settleDamage({ ...input, shares: [share, share] }));
});

test("每一步的整數中間結果符合 int32", () => {
    const result = settleDamage(flameInput(Math.fround));
    function audit(value: unknown): void {
        if (typeof value === "number") {
            assert.ok(Number.isFinite(value) && Math.abs(value) <= 2147483647);
        } else if (Array.isArray(value)) {
            for (const item of value) audit(item);
        } else if (value !== null && typeof value === "object") {
            for (const item of Object.values(value)) audit(item);
        }
    }
    for (const step of result.trace) audit(step.state);
});

test("隨機混合部分的格擋、固定減傷與護盾保留總額", () => {
    for (let count = 1; count <= 12; count++) {
        const input = simpleInput();
        const parts = Array.from({ length: count }, (_, index) => part((index + 1) * 1.25));
        const total = parts.reduce((sum, item) => sum + item.amount, 0);
        const result = settleDamage({
            ...input,
            round: Math.fround,
            event: { ...input.event, parts },
            target: {
                ...input.target,
                modifiers: [{ id: "flat", stat: DamageStat.FlatReduction, value: 3.7 }],
                shields: [{ id: "shield", capacity: 2.3 }],
            },
        });
        assert.ok(Math.abs(result.recipients[0].lifeLoss - Math.max(0, total - 6)) < 0.001);
    }
});
