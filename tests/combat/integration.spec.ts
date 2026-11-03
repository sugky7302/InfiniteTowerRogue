import { test } from "node:test";
import { strict as assert } from "node:assert";
import { integrationCases, combatFixture } from "./integration-cases";
import { TacticalPause, PatrolMachine } from "@features/combat";
for (const sample of integrationCases) {
    const item = sample;
    test(item.name, () => item.run());
}
test("C4 還原寫入失敗保留快照並可重試", () => {
    const f = combatFixture(),
        pause = new TacticalPause(f.registry, f.clock);
    f.clock.pause();
    f.failWeapon();
    assert.throws(() => pause.restore(), /寫入失敗/);
    assert.equal(f.read(f.hero).scale, 0);
    pause.restore();
    assert.equal(f.read(f.hero).scale, 1);
    assert.equal(f.read(f.hero).speed, 270);
    assert.equal(f.read(f.hero).weapons[0], true);
});
test("C4 float32 形狀邊界與整數計時維持安全範圍", () => {
    const m = new PatrolMachine(
        {
            prepareMs: 800,
            recoveryMs: 600,
            length: 160,
            width: 80,
            noticeRange: 600,
            chaseRange: 900,
        },
        [
            { x: 0, y: 0 },
            { x: 300, y: 0 },
        ],
    );
    m.step(50, { x: 0, y: 0 }, { x: Math.fround(100), y: 0 });
    for (let index = 0; index < 16; index++) {
        assert.equal(Math.fround(m.remainingMs), m.remainingMs);
        assert.ok(m.remainingMs <= 2147483647);
        m.step(50, { x: 0, y: 0 }, { x: 100, y: 0 });
    }
    assert.equal(m.contains({ x: Math.fround(160), y: Math.fround(40) }), true);
    assert.equal(m.contains({ x: Math.fround(160.01), y: 0 }), false);
    assert.throws(() => m.step(0.5, { x: 0, y: 0 }));
    assert.throws(() => m.step(2147483647, { x: 0, y: 0 }));
});
