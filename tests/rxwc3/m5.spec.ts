import { strict as assert } from "node:assert";
import { test as nodeTest } from "node:test";
import { Clock, config, createWc3Events, Phase, Subscription } from "../../src/shared/rxwc3";
import { installShieldExample, whenCastCompleted } from "../../src/shared/rxwc3/wc3/m5-logic";
import { SpellEvent } from "@shared/wc3-def/events";
import { damage, FakeEventNatives, fakeUnit, spell } from "./fake-event-natives";
import { FakeClockDriver } from "./fake-clock-driver";
import { verifyM5 } from "./m5-lua.spec";

// 訂閱回呼的錯誤會被隔離。每項測試結束前必須檢查未處理錯誤。
function test(name: string, run: () => void): void {
  nodeTest(name, () => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = error => { errors.push(error); };
    try { run(); assert.deepEqual(errors, []); } finally { config.onUnhandledError = saved; }
  });
}

test("M5 在 Node 執行五組 Lua 共用整合流程", () => {
  assert.equal(verifyM5(), 5);
});

function setupCast(delay = 0.8) {
  const natives = new FakeEventNatives();
  const events = createWc3Events(natives);
  const driver = new FakeClockDriver();
  const clock = new Clock(driver);
  const caster = fakeUnit();
  const received: SpellEvent[] = [];
  const owner = new Subscription();
  owner.add(events.onSpellChannel.of(caster).pipe(
    whenCastCompleted(caster, delay, events.onSpellEndCast, clock),
  ).subscribe(event => received.push(event)));
  const start = (value = spell(caster)): SpellEvent => {
    natives.currentSpell = value;
    natives.emit("spellChannel");
    return value;
  };
  return { natives, events, driver, clock, caster, received, owner, start };
}

test("M5 英雄在 0.8 秒預告完成時送出原始施法快照", () => {
  const s = setupCast();
  const original = s.start();
  s.driver.advance(0.799);
  assert.deepEqual(s.received, []);
  s.driver.advance(0.001);
  assert.deepEqual(s.received, [original]);
  assert.equal(s.clock.pendingCount(), 0);
  assert.equal(s.events.onSpellEndCast.hasSubscribers(), false);
  s.owner.unsubscribe();
});

test("M5 首領使用相同 operator，預告延長至 1.5 秒", () => {
  const s = setupCast(1.5);
  s.start(); s.driver.advance(0.8);
  assert.deepEqual(s.received, []);
  s.driver.advance(0.7);
  assert.equal(s.received.length, 1);
  s.owner.unsubscribe();
});

test("M5 施法結束會取消預告，不送出作用", () => {
  const s = setupCast();
  s.start(); s.driver.advance(0.2);
  s.natives.emit("spellEndCast");
  assert.equal(s.clock.pendingCount(), 0);
  s.driver.advance(2);
  assert.deepEqual(s.received, []);
  s.owner.unsubscribe();
});

test("M5 其他單位結束施法不會取消目前預告", () => {
  const s = setupCast();
  s.start();
  s.natives.currentSpell = spell(fakeUnit());
  s.natives.emit("spellEndCast");
  s.driver.advance(0.8);
  assert.equal(s.received.length, 1);
  s.owner.unsubscribe();
});

test("M5 新施法取代舊預告，從新施法重新計時", () => {
  const s = setupCast();
  s.start(); s.driver.advance(0.4);
  const latest = s.start({ ...spell(s.caster), targetX: 99 });
  assert.equal(s.clock.pendingCount(), 1);
  s.driver.advance(0.4);
  assert.deepEqual(s.received, []);
  s.driver.advance(0.4);
  assert.deepEqual(s.received, [latest]);
  s.owner.unsubscribe();
});

test("M5 暫停不送出，兩次恢復後依剩餘 0.5 秒完成", () => {
  const s = setupCast();
  s.start(); s.driver.advance(0.3);
  s.clock.pause(); s.clock.pause();
  const frozen = s.clock.now();
  s.driver.advance(10);
  s.clock.resume(); s.driver.advance(10);
  assert.deepEqual(s.received, []);
  assert.equal(s.clock.now(), frozen);
  s.clock.resume(); s.driver.advance(0.499);
  assert.deepEqual(s.received, []);
  s.driver.advance(0.001);
  assert.equal(s.received.length, 1);
  assert.equal(s.clock.nowTicks(), 800);
  s.owner.unsubscribe();
});

test("M5 預告在 Combat 階段先於同時的 World 任務送出", () => {
  const s = setupCast();
  const order: string[] = [];
  s.owner.add(s.events.onSpellChannel.of(s.caster).pipe(
    whenCastCompleted(s.caster, 0.8, s.events.onSpellEndCast, s.clock),
  ).subscribe(() => order.push("作用")));
  s.owner.add(s.clock.schedule(0.8, () => order.push("世界"), Phase.World));
  s.start(); s.driver.advance(0.8);
  assert.deepEqual(order, ["作用", "世界"]);
  s.owner.unsubscribe();
});

test("M5 暫停期間取消擁有者會清理預告與全部事件路由", () => {
  const s = setupCast();
  s.start(); s.clock.pause(); s.owner.unsubscribe();
  assert.equal(s.clock.pendingCount(), 0);
  assert.equal(s.events.onSpellChannel.hasSubscribers(), false);
  assert.equal(s.events.onSpellEndCast.hasSubscribers(), false);
  s.clock.resume(); s.driver.advance(2);
  assert.deepEqual(s.received, []);
});

function setupShield() {
  const natives = new FakeEventNatives();
  const events = createWc3Events(natives);
  const target = fakeUnit();
  const owner = new Subscription();
  const messages: string[] = [];
  const state = installShieldExample(owner, events.onDamaging.ofTarget(target), message => messages.push(message));
  const hit = (amount: number): number => {
    natives.currentDamage = damage(fakeUnit(), target, Math.fround(amount));
    natives.emit("damaging");
    return natives.currentDamage.amount;
  };
  return { natives, events, target, owner, messages, ...state, hit };
}

test("M5 兩個修正依訂閱順序組合：先增傷，再由護盾吸收", () => {
  const s = setupShield();
  const after: number[] = [];
  s.owner.add(s.events.onDamaging.ofTarget(s.target).subscribe(event => after.push(event.amount)));
  assert.equal(s.hit(40), 0);
  assert.equal(s.shield(), 20);
  assert.equal(s.depleted(), false);
  assert.deepEqual(s.messages, ["M5 增傷：40 → 80", "M5 護盾：傷害 80，吸收 80，剩餘 20，傷害傳出 0"]);
  assert.equal(s.hit(40), 60);
  assert.deepEqual(after, [0, 60]);
  assert.equal(s.shield(), 0);
  assert.equal(s.depleted(), true);
  assert.equal(s.natives.writes, 4);
  assert.equal(s.messages.filter(message => message === "M5 護盾耗盡。").length, 1);
  s.owner.unsubscribe();
});

test("M5 護盾恰好耗盡時傷害為零，之後不再吸收", () => {
  const s = setupShield();
  assert.equal(s.hit(50), 0);
  assert.equal(s.depleted(), true);
  assert.equal(s.hit(10), 20);
  assert.equal(s.shield(), 0);
  assert.equal(s.messages.filter(message => message === "M5 護盾耗盡。").length, 1);
  s.owner.unsubscribe();
});

test("M5 零與負傷害不增加護盾，也不觸發增傷", () => {
  const s = setupShield();
  assert.equal(s.hit(0), 0);
  assert.equal(s.hit(-10), -10);
  assert.equal(s.shield(), 100);
  assert.deepEqual(s.messages, []);
  assert.equal(s.natives.writes, 0);
  s.owner.unsubscribe();
});

test("M5 小數護盾修正符合 float32，全部示範數值在 int32 範圍內", () => {
  const s = setupShield();
  assert.equal(s.hit(12.5), 0);
  assert.equal(s.shield(), Math.fround(100 - Math.fround(12.5 * 2)));
  assert.equal(s.hit(50), Math.fround(25));
  for (const value of [100, 80, 60, s.shield(), s.natives.currentDamage.amount]) {
    assert.ok(Number.isFinite(value) && Math.abs(value) <= 2147483647);
    assert.equal(value, Math.fround(value));
  }
  s.owner.unsubscribe();
});

test("M5 取消擁有者後不再修改傷害或執行護盾副作用", () => {
  const s = setupShield();
  s.owner.unsubscribe();
  assert.equal(s.hit(100), 100);
  assert.equal(s.shield(), 100);
  assert.deepEqual(s.messages, []);
  assert.equal(s.events.onDamaging.hasSubscribers(), false);
});
