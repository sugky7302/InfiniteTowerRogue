import { strict as assert } from "node:assert";
import { test as nodeTest } from "node:test";
import { Clock, config, createWc3Events, frames, Phase } from "../../src/shared/rxwc3";
import {
    attributeModifier,
    checkValue,
    rollCheck,
    displayNumber,
    manaCapacity,
    resolveDamage,
    spellDefense,
    spellPower,
    Burning,
    MovementSlows,
    periodicTicks,
} from "@entities/combat";
import { castSeconds, fireball, frostbolt, rangeYards, skills, yardsToWc3 } from "@features/skill";
import { scholar } from "@entities/character";
import { installPauseBridge } from "@features/combat";
import { FakeEventNatives } from "../rxwc3/fake-event-natives";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";
import { abilityCode, FakeFrames, FakeSkillNatives, makeUnit, unitState } from "./fakes";
import { setupSkill } from "./setup";
import { verifySkill } from "./basic-lua.spec";

function test(name: string, run: () => void): void {
    nodeTest(name, () => {
        const saved = config.onUnhandledError,
            errors: unknown[] = [];
        config.onUnhandledError = (error) => {
            errors.push(error);
        };
        try {
            run();
            assert.deepEqual(errors, []);
        } finally {
            config.onUnhandledError = saved;
        }
    });
}
function threshold(skill = fireball, adverse = 0) {
    return checkValue({
        challenge: 1,
        complexity: skill.complexity,
        adverse,
        level: scholar.level,
        attribute: attributeModifier(scholar.intelligence),
        knowledge: skill.knowledge,
        favorable: 0,
    });
}
const defense = { defense: 12, resistance: 0, shield: 0 };
test("技能在 Node 執行十六組 Lua 共用流程", () => assert.equal(verifySkill(), 16));
test("S0 預設間隔為 1/32 秒，訂閱時不立即送出", () => {
    const timer = new FakeFrames(),
        clock = new Clock(new FakeClockDriver());
    let delta = 0;
    const s = frames({ clock, natives: timer }).subscribe((frame) => {
        delta = frame.deltaSeconds;
    });
    assert.equal(delta, 0);
    assert.equal(timer.seconds, 1 / 32);
    timer.fire();
    assert.equal(delta, Math.fround(1 / 32));
    s.unsubscribe();
});
test("S0 自訂間隔直接交給週期計時器", () => {
    const timer = new FakeFrames();
    const s = frames({ seconds: 0.125, natives: timer }).subscribe();
    assert.equal(timer.seconds, 0.125);
    s.unsubscribe();
});
test("S0 假原生計時器依間隔送出，取消後不再喚醒", () => {
    const driver = new FakeClockDriver();
    driver.start();
    let running = false,
        count = 0;
    const source = frames({
        seconds: 1 / 32,
        natives: {
            start(seconds, callback) {
                running = true;
                const wake = (): void => {
                    callback();
                    if (running) driver.wakeAfter(seconds, wake);
                };
                driver.wakeAfter(seconds, wake);
                return () => {
                    running = false;
                    driver.cancelWake();
                };
            },
        },
    });
    const sub = source.subscribe(() => {
        count++;
    });
    driver.advance(0.03);
    assert.equal(count, 0);
    driver.advance(0.00125);
    assert.equal(count, 1);
    driver.advance(1 / 32);
    assert.equal(count, 2);
    sub.unsubscribe();
    driver.advance(1);
    assert.equal(count, 2);
    assert.equal(driver.isArmed(), false);
});
test("S0 多位訂閱者共用一個計時器，最後取消才停止", () => {
    const timer = new FakeFrames(),
        source = frames({ natives: timer });
    const a = source.subscribe(),
        b = source.subscribe();
    assert.equal(timer.starts, 1);
    a.unsubscribe();
    assert.equal(timer.stops, 0);
    b.unsubscribe();
    assert.equal(timer.stops, 1);
    const c = source.subscribe();
    assert.equal(timer.starts, 2);
    c.unsubscribe();
});
test("S0 暫停引用計數歸零後恢復，不補發暫停期間的幀", () => {
    const timer = new FakeFrames(),
        clock = new Clock(new FakeClockDriver());
    let count = 0;
    const s = frames({ clock, natives: timer }).subscribe(() => {
        count++;
    });
    clock.pause();
    clock.pause();
    timer.fire(320);
    clock.resume();
    timer.fire();
    assert.equal(count, 0);
    clock.resume();
    timer.fire();
    assert.equal(count, 1);
    s.unsubscribe();
    timer.fire();
    assert.equal(count, 1);
});
test("S0 拒絕非有限、零、負數與超長間隔", () => {
    for (const seconds of [NaN, Infinity, 0, -1, 61]) assert.throws(() => frames({ seconds }));
});
test("S0 通知內取消全部訂閱能停止計時器", () => {
    const timer = new FakeFrames();
    let count = 0;
    const sub = frames({ natives: timer }).subscribe(() => {
        count++;
        sub.unsubscribe();
    });
    timer.fire(2);
    assert.equal(count, 1);
    assert.equal(timer.stops, 1);
});
test("S0 預設呼叫取得同一個來源", () => assert.equal(frames(), frames()));
test("S1 火球術與寒冰箭的施法時間符合已決策公式", () => {
    assert.equal(castSeconds(fireball), 1.5);
    assert.equal(castSeconds(frostbolt), 1.75);
});
test("S1 施法速度、附加時間與最低時間", () => {
    assert.equal(castSeconds(fireball, 1), 0.75);
    assert.equal(castSeconds(fireball, 0, 0.5), 2);
    assert.equal(castSeconds(fireball, 100), 0.1);
});
test("S1 射程級距及碼換算", () => {
    assert.equal(rangeYards(fireball), 10);
    assert.equal(rangeYards(frostbolt), 40);
    assert.equal(yardsToWc3(40), 1280);
    assert.equal(yardsToWc3(3), 96);
});
test("S1 固定角色屬性、法術強度、法力與法防", () => {
    assert.equal(attributeModifier(16), 4);
    assert.equal(attributeModifier(4), 2);
    assert.equal(attributeModifier(200), 10);
    assert.equal(spellPower(16, 9), 41);
    assert.equal(manaCapacity(16, 9), 69);
    assert.equal(spellDefense(4, 4), 12);
});
test("S1 火球術檢定值 5，寒冰箭檢定值 7", () => {
    assert.equal(threshold(), 5);
    assert.equal(threshold(frostbolt, 2), 7);
});
test("S1 檢定上下限與規則頁範例 11", () => {
    const value = {
        challenge: 2,
        complexity: 3,
        adverse: 1,
        level: 1,
        attribute: 2,
        knowledge: 1,
        favorable: 0,
    };
    assert.equal(checkValue(value), 11);
    assert.equal(checkValue({ ...value, adverse: 100 }), 19);
    assert.equal(checkValue({ ...value, favorable: 100 }), 2);
});
test("S1 D20 嚴格大於門檻，同值失敗且成功率為 75% 與 65%", () => {
    for (const [limit, expected] of [
        [5, 15],
        [7, 13],
    ]) {
        let count = 0;
        for (let roll = 1; roll <= 20; roll++) {
            const value = roll;
            if (rollCheck(limit, () => value).success) count++;
        }
        assert.equal(count, expected);
        assert.equal(rollCheck(limit, () => limit).success, false);
    }
});
test("S1 寒冰箭基礎傷害 42.8，法防後約 38.2", () => {
    const r = resolveDamage(10, 41, 0.8, defense);
    assert.ok(Math.abs(r.raw - 42.8) < 1e-10);
    assert.ok(Math.abs(r.life - 38.214285714) < 1e-8);
});
test("S1 火球直接傷害與燃燒各自經法防", () => {
    assert.ok(Math.abs(resolveDamage(10, 41, 0, defense).life - 8.928571429) < 1e-8);
    assert.ok(Math.abs(resolveDamage(2, 41, 0, defense).life - 1.785714286) < 1e-8);
});
test("S1 有效防禦不低於零，防禦減傷上限 80%", () => {
    assert.equal(resolveDamage(100, 0, 0, { ...defense, defense: -12 }).life, 100);
    assert.ok(Math.abs(resolveDamage(100, 0, 0, { ...defense, defense: 10000 }).life - 20) < 1e-10);
});
test("S1 最終抗性限制為負 100% 至 75%", () => {
    assert.equal(resolveDamage(100, 0, 0, { defense: 0, resistance: -2, shield: 0 }).life, 200);
    assert.equal(resolveDamage(100, 0, 0, { defense: 0, resistance: 2, shield: 0 }).life, 25);
});
test("S1 抗性後才扣護盾，護盾吸收不計生命損失", () => {
    const r = resolveDamage(100, 0, 0, { defense: 0, resistance: 0.5, shield: 30 });
    assert.deepEqual([r.absorbed, r.shield, r.life], [30, 0, 20]);
    const full = resolveDamage(100, 0, 0, { defense: 0, resistance: 0, shield: 120 });
    assert.deepEqual([full.life, full.shield], [0, 20]);
});
test("S1 float32 計算保持預期精度，整數時間不超過上限", () => {
    const f = Math.fround;
    const raw = f(10 + f(41 * f(0.8)));
    const final = f(raw * f(1 - f(12 / 112)));
    assert.ok(Math.abs(final - resolveDamage(10, 41, 0.8, defense).life) < 0.00001);
    const times = periodicTicks(2147479000, 1, 1, 3);
    assert.deepEqual(times, [2147480000, 2147481000, 2147482000]);
    assert.ok(times.every((value) => Number.isInteger(value) && value <= 2147483647));
});
test("S1 顯示會處理正負零與小數四捨五入", () => {
    assert.equal(displayNumber(-0), "0");
    assert.equal(displayNumber(-0.001), "0");
    assert.equal(displayNumber(38.214), "38.2");
    assert.equal(displayNumber(-1.25), "-1.3");
});
test("S1 週期公式含結束端點，不在建立時多跳一次", () => {
    assert.deepEqual(periodicTicks(2000, 1, 1, 3), [3000, 4000, 5000]);
    assert.deepEqual(periodicTicks(0, 0, 1, 2), [0, 1000, 2000]);
    assert.deepEqual(periodicTicks(0, 4, 1, 3), []);
    assert.throws(() => periodicTicks(0, 0, 0, 3));
});
test("S1 燃燒刷新取消未發生事件，不追回已發生傷害", () => {
    const driver = new FakeClockDriver(),
        clock = new Clock(driver);
    let count = 0;
    const b = new Burning(clock, () => {
        count++;
    });
    b.refresh(1, 1, 3);
    driver.advance(1.5);
    assert.equal(count, 1);
    b.refresh(1, 1, 3);
    driver.advance(0.5);
    assert.equal(count, 1);
    driver.advance(2.5);
    assert.equal(count, 4);
    assert.equal(clock.pendingCount(), 0);
    b.clear();
});
test("S1 燃燒提前解除與世界暫停", () => {
    const driver = new FakeClockDriver(),
        clock = new Clock(driver);
    let count = 0;
    const b = new Burning(clock, () => {
        count++;
    });
    b.refresh(1, 1, 3);
    driver.advance(0.5);
    clock.pause();
    driver.advance(20);
    assert.equal(count, 0);
    clock.resume();
    driver.advance(0.5);
    assert.equal(count, 1);
    b.clear();
    driver.advance(3);
    assert.equal(count, 1);
});
test("S1 同群組減速不相乘，較強者到期後恢復較弱者", () => {
    const driver = new FakeClockDriver(),
        clock = new Clock(driver);
    let speed = 1;
    const slow = new MovementSlows(clock, (value) => {
        speed = value;
    });
    slow.refresh("甲", "冰", 0.5, 8);
    slow.refresh("乙", "冰", 0.25, 2);
    assert.equal(speed, 0.25);
    driver.advance(2);
    assert.equal(speed, 0.5);
    driver.advance(6);
    assert.equal(speed, 1);
    slow.clear();
});
test("S1 減速同來源刷新、跨群組較強者生效與主動解除", () => {
    const driver = new FakeClockDriver(),
        clock = new Clock(driver);
    let speed = 1;
    const slow = new MovementSlows(clock, (value) => {
        speed = value;
    });
    slow.refresh("甲", "冰", 0.5, 8);
    driver.advance(4);
    slow.refresh("甲", "冰", 0.5, 8);
    slow.refresh("乙", "泥", 0.7, 10);
    driver.advance(4);
    assert.equal(speed, 0.5);
    slow.remove("甲", "冰");
    assert.equal(speed, 0.7);
    slow.clear();
    assert.equal(speed, 1);
    assert.equal(clock.pendingCount(), 0);
});
test("S1 暫停轉接保存多單位、多技能與零冷卻", () => {
    const clock = new Clock(new FakeClockDriver()),
        n = new FakeSkillNatives(),
        a = makeUnit(),
        b = makeUnit();
    n.startCooldown(a, 1, 2.75);
    n.startCooldown(b, 1, 1.5);
    n.setRegen(b, 7);
    const bridge = installPauseBridge(clock, n, [a, b], [1, 2]);
    clock.pause();
    assert.equal(n.regen(a), 0);
    assert.equal(unitState(a).disabled.get(1), 1);
    assert.equal(unitState(a).disabled.get(2), 1);
    assert.equal(n.mana(a), 69);
    assert.equal(n.cooldown(a, 1), 0);
    clock.resume();
    assert.equal(n.regen(b), 7);
    assert.equal(n.cooldown(b, 1), 1.5);
    assert.equal(n.cooldown(a, 2), 0);
    bridge.unsubscribe();
});
test("S3 暫停時不動正在施法單位的任何技能，恢復時以快照校正冷卻", () => {
    // 停用正在引導的技能或同單位的其他技能，都會使施法被判定為中斷（S3 第二、三次驗證）。
    const clock = new Clock(new FakeClockDriver()),
        n = new FakeSkillNatives(),
        caster = makeUnit(),
        idle = makeUnit();
    n.startCooldown(caster, 1, 4);
    n.startCooldown(caster, 2, 2);
    n.startCooldown(idle, 1, 3);
    const bridge = installPauseBridge(clock, n, [caster, idle], [1, 2], (unit) => unit === caster);
    clock.pause();
    assert.equal(unitState(caster).disabled.get(1) ?? 0, 0);
    assert.equal(unitState(caster).disabled.get(2) ?? 0, 0);
    assert.equal(n.cooldown(caster, 1), 4);
    assert.equal(n.cooldown(caster, 2), 2);
    assert.equal(unitState(idle).disabled.get(1), 1);
    assert.equal(n.cooldown(idle, 1), 0);
    // 暫停期間原生冷卻仍可能前進；恢復時以快照校正。
    n.startCooldown(caster, 1, 1);
    clock.resume();
    assert.equal(unitState(caster).disabled.get(1) ?? 0, 0);
    assert.equal(unitState(idle).disabled.get(1), 0);
    assert.equal(n.cooldown(caster, 1), 4);
    assert.equal(n.cooldown(caster, 2), 2);
    assert.equal(n.cooldown(idle, 1), 3);
    bridge.unsubscribe();
});
test("S1 重複暫停不覆寫快照，最後恢復才還原", () => {
    const clock = new Clock(new FakeClockDriver()),
        n = new FakeSkillNatives(),
        a = makeUnit();
    const bridge = installPauseBridge(clock, n, [a], [1]);
    clock.pause();
    clock.pause();
    clock.resume();
    assert.equal(n.regen(a), 0);
    clock.resume();
    assert.equal(n.regen(a), 2);
    bridge.unsubscribe();
});
test("S1 在已暫停世界安裝轉接，取消時還原原生狀態", () => {
    const clock = new Clock(new FakeClockDriver()),
        n = new FakeSkillNatives(),
        a = makeUnit();
    clock.pause();
    const bridge = installPauseBridge(clock, n, [a], [1]);
    assert.equal(n.regen(a), 0);
    bridge.unsubscribe();
    assert.equal(n.regen(a), 2);
    clock.resume();
});
test("S2 施法完成前沒有骰值，完成後飛行 0.5 秒才命中", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(1.749);
    assert.equal(s.natives.randomCalls, 0);
    s.driver.advance(0.001);
    assert.equal(s.natives.randomCalls, 1);
    s.timer.fire(15);
    assert.equal(s.natives.hits.length, 0);
    s.timer.fire();
    assert.equal(s.natives.hits.length, 1);
    assert.equal(unitState(s.target).speed, 135);
    s.driver.advance(8);
    assert.equal(unitState(s.target).speed, 270);
    s.runtime.owner.unsubscribe();
});
test("S2 施法中斷不擲骰、不產生投射物", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(0.5);
    s.eventNatives.emit("spellEndCast");
    s.driver.advance(2);
    assert.equal(s.natives.randomCalls, 0);
    assert.equal(s.natives.visuals.length, 0);
    s.runtime.owner.unsubscribe();
});
test("S3 暫停期間拒絕新施法，返還法力並結束冷卻，暫停前的施法也中斷", () => {
    // 使用者在寒冰箭施法中暫停，再施放火球術，恢復後兩個技能都完成（S3 第四次驗證）。
    const s = setupSkill();
    s.cast();
    s.driver.advance(1);
    s.clock.pause();
    const mana = s.natives.mana(s.caster);
    s.cast(fireball);
    assert.equal(s.natives.mana(s.caster), mana + fireball.mana);
    assert.equal(s.natives.cooldown(s.caster, abilityCode(fireball.code)), 0);
    s.clock.resume();
    s.driver.advance(5);
    assert.equal(s.natives.randomCalls, 0);
    assert.equal(s.natives.visuals.length, 0);
    s.runtime.owner.unsubscribe();
});
test("S2 新技能施法取代舊技能的完成排程", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(1);
    s.cast(fireball);
    s.driver.advance(0.75);
    assert.equal(s.natives.randomCalls, 0);
    s.driver.advance(0.75);
    assert.equal(s.natives.randomCalls, 1);
    s.runtime.owner.unsubscribe();
});
test("S2 檢定失敗顯示骰值，不產生投射物", () => {
    const s = setupSkill();
    s.natives.roll = 7;
    s.cast();
    s.driver.advance(1.75);
    assert.equal(s.natives.visuals.length, 0);
    assert.match(s.natives.messages[0], /失敗，骰值 7/);
    s.runtime.owner.unsubscribe();
});
test("S2 寒冰箭追蹤移動後的目標", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(1.75);
    s.timer.fire(8);
    unitState(s.target).x = 480;
    s.timer.fire(8);
    assert.equal(s.natives.hits.length, 0);
    s.timer.fire(8);
    assert.equal(s.natives.hits.length, 1);
    s.runtime.owner.unsubscribe();
});
test("S2 目標死亡或消失時投射物清理且不命中", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(1.75);
    unitState(s.target).alive = false;
    s.timer.fire();
    assert.equal(s.natives.hits.length, 0);
    assert.equal(s.natives.visuals[0].destroyed, true);
    s.runtime.owner.unsubscribe();
});
test("S2 施法完成前目標失效或不可見時不擲骰", () => {
    for (const field of ["alive", "visible", "enemy"] as const) {
        const s = setupSkill();
        s.cast();
        unitState(s.target)[field] = false;
        s.driver.advance(2);
        assert.equal(s.natives.randomCalls, 0);
        s.runtime.owner.unsubscribe();
    }
});
test("S2 世界暫停停止施法、飛行與持續效果", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(1);
    s.clock.pause();
    s.driver.advance(10);
    s.timer.fire(32);
    assert.equal(s.natives.visuals.length, 0);
    s.clock.resume();
    s.driver.advance(0.75);
    s.timer.fire(8);
    const x = s.natives.visuals[0].x;
    s.clock.pause();
    s.timer.fire(32);
    assert.equal(s.natives.visuals[0].x, x);
    s.clock.resume();
    s.timer.fire(8);
    assert.equal(s.natives.hits.length, 1);
    s.clock.pause();
    s.driver.advance(20);
    assert.equal(unitState(s.target).speed, 135);
    s.clock.resume();
    s.driver.advance(8);
    assert.equal(unitState(s.target).speed, 270);
    s.runtime.owner.unsubscribe();
});
test("S2 火球區域涵蓋友軍、施法者與邊界，排除區域外目標", () => {
    const s = setupSkill(),
        edge = makeUnit(96),
        outside = makeUnit(97);
    unitState(edge).enemy = false;
    s.natives.targets = [s.caster, edge, outside];
    s.cast(fireball, 0, 0);
    s.driver.advance(1.5);
    s.timer.fire();
    assert.deepEqual(
        s.natives.hits.map((hit) => hit.target),
        [s.caster, edge],
    );
    s.driver.advance(3);
    assert.equal(s.natives.hits.length, 8);
    s.runtime.owner.unsubscribe();
});
test("S2 不可燃目標只受直接傷害", () => {
    const s = setupSkill();
    unitState(s.target).combustible = false;
    s.cast(fireball);
    s.driver.advance(1.5);
    s.timer.fire(16);
    s.driver.advance(3);
    assert.equal(s.natives.hits.length, 1);
    s.runtime.owner.unsubscribe();
});
test("S2 護盾在原生傷害事件前吸收，完全吸收仍套用減速", () => {
    const s = setupSkill();
    unitState(s.target).shield = 100;
    s.cast();
    s.driver.advance(1.75);
    s.timer.fire(16);
    assert.equal(s.natives.hits[0].amount, 0);
    assert.ok(Math.abs(unitState(s.target).shield - 61.785714286) < 1e-8);
    assert.equal(unitState(s.target).speed, 135);
    s.runtime.owner.unsubscribe();
});
test("S2 多個投射物共用同一個幀來源，停止後清理全部資源", () => {
    const s = setupSkill();
    s.cast();
    s.driver.advance(1.75);
    s.cast();
    s.driver.advance(1.75);
    assert.equal(s.timer.starts, 1);
    assert.equal(s.natives.visuals.length, 2);
    s.runtime.owner.unsubscribe();
    assert.equal(s.timer.stops, 1);
    assert.ok(s.natives.visuals.every((visual) => visual.destroyed));
    assert.equal(s.clock.pendingCount(), 0);
    assert.equal(s.events.onSpellChannel.hasSubscribers(), false);
});
test("S1 技能成本、冷卻及持續效果都集中在定義", () => {
    assert.deepEqual(
        skills.map((skill) => [skill.mana, skill.cooldown]),
        [
            [15, 4],
            [10, 0],
        ],
    );
    assert.deepEqual(fireball.burn, { damage: 2, delay: 1, period: 1, duration: 3 });
    assert.equal(frostbolt.slow?.duration, 8);
});

test("S3 各種命令均中斷施法，不依賴引導結束事件", () => {
    for (const kind of ["immediate", "point", "target"] as const) {
        for (const orderId of [851972, 851986, 851983, 852488, 852226]) {
            const s = setupSkill();
            s.cast();
            s.driver.advance(0.25);
            s.eventNatives.currentOrder = {
                unit: s.caster,
                kind,
                orderId,
                target: s.target,
                targetX: 100,
                targetY: 200,
            };
            s.eventNatives.emit("order");
            s.driver.advance(3);
            assert.equal(s.natives.randomCalls, 0);
            assert.equal(s.natives.visuals.length, 0);
            assert.deepEqual(s.natives.messages, ["中斷"]);
            assert.equal(s.natives.stops.length, 0);
            s.runtime.owner.unsubscribe();
        }
    }
});

test("S3 起始命令不取消新施法，完成停止與同步引導結束只結算一次", () => {
    const s = setupSkill();
    s.cast();
    assert.equal(s.natives.messages.length, 0);
    s.driver.advance(1.75);
    assert.deepEqual(s.natives.stops, [s.caster]);
    assert.equal(s.natives.randomCalls, 1);
    assert.equal(s.natives.visuals.length, 1);
    assert.equal(s.natives.messages.includes("中斷"), false);
    s.driver.advance(60);
    assert.equal(s.natives.randomCalls, 1);
    s.runtime.owner.unsubscribe();
});

test("S3 引導結束與重複命令只顯示一次中斷", () => {
    const s = setupSkill();
    s.cast();
    s.eventNatives.emit("spellEndCast");
    s.order();
    s.eventNatives.emit("spellEndCast");
    s.driver.advance(2);
    assert.deepEqual(s.natives.messages, ["中斷"]);
    assert.equal(s.natives.randomCalls, 0);
    s.runtime.owner.unsubscribe();
});

test("S3 暫停轉接期間停止施法計時，恢復後完成並正常擲骰", () => {
    const s = setupSkill();
    const bridge = installPauseBridge(s.clock, s.natives, [s.caster], [1, 2]);
    s.cast();
    s.driver.advance(0.5);
    s.clock.pause();
    const calls = s.natives.resourceCalls.length;
    s.driver.advance(10);
    assert.equal(s.natives.resourceCalls.length, calls);
    assert.equal(s.natives.randomCalls, 0);
    assert.equal(s.natives.stops.length, 0);
    s.clock.resume();
    s.driver.advance(1.249);
    assert.equal(s.natives.randomCalls, 0);
    s.driver.advance(0.001);
    assert.equal(s.natives.randomCalls, 1);
    assert.equal(s.natives.messages.includes("中斷"), false);
    bridge.unsubscribe();
    s.runtime.owner.unsubscribe();
});

test("S3 暫停期間仍接受命令中斷與引導結束中斷", () => {
    for (const endCast of [false, true]) {
        const s = setupSkill();
        s.cast();
        s.clock.pause();
        if (endCast) s.eventNatives.emit("spellEndCast");
        else s.order();
        s.clock.resume();
        s.driver.advance(2);
        assert.deepEqual(s.natives.messages, ["中斷"]);
        assert.equal(s.natives.randomCalls, 0);
        s.runtime.owner.unsubscribe();
    }
});

test("S3 其他單位命令不影響施法，清理後全部施法路由釋放", () => {
    const s = setupSkill();
    s.cast();
    s.eventNatives.currentOrder = { ...s.eventNatives.currentOrder, unit: s.target };
    s.eventNatives.emit("order");
    s.driver.advance(1.75);
    assert.equal(s.natives.randomCalls, 1);
    s.runtime.owner.unsubscribe();
    assert.equal(s.events.onUnitOrder.routeCount(), 0);
    assert.equal(s.events.onSpellEndCast.routeCount(), 0);
    assert.equal(s.clock.pendingCount(), 0);
});

test("S3 轉接只還原自身停用，保留外部計數並去除重複輸入", () => {
    const driver = new FakeClockDriver(),
        clock = new Clock(driver),
        n = new FakeSkillNatives(),
        hero = makeUnit();
    n.startCooldown(hero, 1, 2.75);
    n.disableAbility(hero, 1, true);
    const bridge = installPauseBridge(clock, n, [hero, hero], [1, 1, 2]);
    n.resourceCalls = [];
    clock.pause();
    assert.deepEqual(n.resourceCalls, ["結束冷卻", "停用", "結束冷卻", "停用"]);
    assert.equal(unitState(hero).disabled.get(1), 2);
    n.disableAbility(hero, 1, true);
    clock.pause();
    clock.resume();
    assert.equal(unitState(hero).disabled.get(1), 3);
    n.resourceCalls = [];
    clock.resume();
    assert.deepEqual(n.resourceCalls, ["啟用", "開始冷卻", "啟用", "結束冷卻"]);
    assert.equal(unitState(hero).disabled.get(1), 2);
    assert.equal(unitState(hero).disabled.get(2), 0);
    bridge.unsubscribe();
    bridge.unsubscribe();
    assert.equal(unitState(hero).disabled.get(1), 2);
});

test("S3 暫停中清理只啟用一次，可重新安裝轉接", () => {
    const clock = new Clock(new FakeClockDriver()),
        n = new FakeSkillNatives(),
        hero = makeUnit();
    clock.pause();
    for (let index = 0; index < 2; index++) {
        const bridge = installPauseBridge(clock, n, [hero], [1]);
        assert.equal(unitState(hero).disabled.get(1), 1);
        bridge.unsubscribe();
        assert.equal(unitState(hero).disabled.get(1), 0);
    }
    clock.resume();
    assert.equal(unitState(hero).disabled.get(1), 0);
});

test("S3 命令中樞依訂閱順序分發，取消後不再讀取快照", () => {
    const s = setupSkill(),
        seen: string[] = [],
        snapshots: number[] = [];
    const a = s.events.onUnitOrder.subscribe((event) => {
        seen.push("全部");
        snapshots.push(event.orderId);
    });
    const b = s.events.onUnitOrder.of({ handle: s.target }).subscribe(() => {
        seen.push("目標");
    });
    const c = s.events.onUnitOrder.subscribe(() => {
        seen.push("後續");
    });
    const creates = s.eventNatives.creates;
    s.eventNatives.currentOrder = {
        ...s.eventNatives.currentOrder,
        unit: s.target,
        orderId: 851986,
    };
    s.eventNatives.emit("order");
    s.eventNatives.currentOrder = { ...s.eventNatives.currentOrder, orderId: 1 };
    assert.deepEqual(seen, ["全部", "目標", "後續"]);
    assert.deepEqual(snapshots, [851986]);
    assert.equal(s.eventNatives.creates, creates);
    a.unsubscribe();
    b.unsubscribe();
    c.unsubscribe();
    s.runtime.owner.unsubscribe();
    const reads = s.eventNatives.reads;
    s.eventNatives.emit("order");
    assert.equal(s.eventNatives.reads, reads);
    assert.equal(s.events.onUnitOrder.routeCount(), 0);
});

test("S3 施法完成使用戰鬥階段，先於同時到期的預設階段", () => {
    const s = setupSkill(),
        seen: number[] = [];
    s.clock.schedule(
        1.75,
        () => {
            seen.push(s.natives.randomCalls);
        },
        Phase.Default,
    );
    s.cast();
    s.driver.advance(1.75);
    assert.deepEqual(seen, [1]);
    s.runtime.owner.unsubscribe();
});

test("S3 命令中樞第一次訂閱才註冊，全部路由共用觸發器", () => {
    const natives = new FakeEventNatives(),
        source = createWc3Events(natives).onUnitOrder;
    const route = source.of(makeUnit());
    assert.equal(natives.creates, 0);
    const a = route.subscribe(),
        b = source.subscribe();
    assert.equal(natives.creates, 1);
    a.unsubscribe();
    b.unsubscribe();
    const c = source.subscribe();
    assert.equal(natives.creates, 1);
    c.unsubscribe();
});
