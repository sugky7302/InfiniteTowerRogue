import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DamageStat, DamageOutput, CombatStats } from "@entities/combat";
import { fireball } from "@features/skill";
import { setupSkill } from "../skill/setup";

test("寒冰箭使用法術輸出與法防通道並匹配寒冰標籤", () => {
    const setup = setupSkill();
    const stats: CombatStats = setup.natives;
    stats.damageTarget = () => ({
        life: 1000,
        maxLife: 1000,
        physicalDefense: 10000,
        spellDefense: 0,
        immuneTags: ["fire"],
    });
    stats.damageAttacker = () => ({
        modifiers: [
            {
                id: "frost",
                stat: DamageStat.Increase,
                value: 0.5,
                tags: ["frost"],
                output: DamageOutput.Spell,
            },
            { id: "melee", stat: DamageStat.Increase, value: 1, output: DamageOutput.Melee },
        ],
    });
    try {
        setup.cast();
        setup.driver.advance(1.75);
        setup.timer.fire(16);
        assert.ok(Math.abs(setup.natives.hits[0].amount - 64.2) < 0.001);
    } finally {
        setup.runtime.owner.unsubscribe();
    }
});

test("火球與燃燒匹配火焰標籤，每次週期重新讀取免疫", () => {
    const setup = setupSkill();
    const stats: CombatStats = setup.natives;
    let immune = true;
    stats.damageTarget = () => ({ life: 1000, maxLife: 1000, immuneTags: immune ? ["fire"] : [] });
    try {
        setup.cast(fireball);
        setup.driver.advance(1.5);
        setup.timer.fire(16);
        assert.equal(setup.natives.hits[0].amount, 0);
        immune = false;
        setup.driver.advance(1);
        assert.equal(setup.natives.hits[1].amount, 2);
        immune = true;
        setup.driver.advance(1);
        assert.equal(setup.natives.hits[2].amount, 0);
    } finally {
        setup.runtime.owner.unsubscribe();
    }
});

test("燃燒鎖定攻擊者加成與穿透，並讀取目前目標抗性", () => {
    const setup = setupSkill();
    const stats: CombatStats = setup.natives;
    let increase = 1;
    let resistance = 0;
    let penetration = 0.25;
    stats.damageTarget = () => ({
        life: 1000,
        maxLife: 1000,
        modifiers: [{ id: "resist", stat: DamageStat.Resistance, value: resistance }],
    });
    stats.damageAttacker = () => ({
        modifiers: [
            { id: "increase", stat: DamageStat.Increase, value: increase },
            { id: "penetration", stat: DamageStat.ElementPenetration, value: penetration },
        ],
    });
    try {
        setup.cast(fireball);
        setup.driver.advance(1.5);
        setup.timer.fire(16);
        assert.equal(setup.natives.hits[0].amount, 25);
        increase = 0;
        penetration = 0;
        resistance = 0.5;
        setup.driver.advance(1);
        assert.equal(setup.natives.hits[1].amount, 3);
        resistance = 0.25;
        setup.driver.advance(1);
        assert.equal(setup.natives.hits[2].amount, 4);
    } finally {
        setup.runtime.owner.unsubscribe();
    }
});

test("燃燒刷新建立新輸出快照並取消舊週期", () => {
    const setup = setupSkill();
    const stats: CombatStats = setup.natives;
    let increase = 0;
    stats.damageTarget = () => ({ life: 1000, maxLife: 1000 });
    stats.damageAttacker = () => ({
        modifiers: [{ id: "increase", stat: DamageStat.Increase, value: increase }],
    });
    try {
        setup.cast(fireball);
        setup.driver.advance(1.5);
        setup.timer.fire(16);
        setup.driver.advance(1);
        assert.equal(setup.natives.hits[1].amount, 2);
        increase = 1;
        setup.cast(fireball);
        setup.driver.advance(1.5);
        setup.timer.fire(16);
        const before = setup.natives.hits.length;
        setup.driver.advance(1);
        assert.equal(setup.natives.hits.length, before + 1);
        assert.equal(setup.natives.hits[before].amount, 4);
    } finally {
        setup.runtime.owner.unsubscribe();
    }
});

test("技能預設快照生命較大時使用結算生命損失", () => {
    const setup = setupSkill();
    try {
        setup.cast();
        setup.driver.advance(1.75);
        setup.timer.fire(16);
        assert.ok(Math.abs(setup.natives.hits[0].amount - 42.8 * (1 - 12 / 112)) < 1e-10);
    } finally {
        setup.runtime.owner.unsubscribe();
    }
});
