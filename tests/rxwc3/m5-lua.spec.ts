import { Clock, config, createWc3Events, interval, Subscription } from "../../src/shared/rxwc3";
import { installShieldExample, whenCastCompleted } from "../../src/shared/rxwc3/wc3/m5-logic";
import { damage, FakeEventNatives, fakeUnit, spell } from "./fake-event-natives";
import { FakeClockDriver } from "./fake-clock-driver";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// Node 與 Lua 執行同一段整合流程；不以此取代遊戲內的原生驗證。
export function verifyM5(): number {
  const owner = new Subscription();
  const saved = config.onUnhandledError;
  const errors: unknown[] = [];
  config.onUnhandledError = error => { errors.push(error); };
  let groups = 0;
  try {
    const natives = new FakeEventNatives();
    const events = createWc3Events(natives);
    const driver = new FakeClockDriver();
    const clock = new Clock(driver);
    const hero = fakeUnit(), boss = fakeUnit(), target = fakeUnit();
    const heroValues: number[] = [], bossValues: number[] = [];
    owner.add(events.onSpellChannel.of(hero).pipe(whenCastCompleted(hero, 0.8, events.onSpellEndCast, clock))
      .subscribe(event => heroValues.push(event.targetX)));
    owner.add(events.onSpellChannel.of(boss).pipe(whenCastCompleted(boss, 1.5, events.onSpellEndCast, clock))
      .subscribe(event => bossValues.push(event.targetX)));
    natives.currentSpell = spell(hero); natives.emit("spellChannel");
    natives.currentSpell = spell(boss); natives.emit("spellChannel");
    driver.advance(0.799);
    check(heroValues.length === 0 && bossValues.length === 0, "M5 預告提早送出。");
    driver.advance(0.001);
    check(heroValues.length === 1 && bossValues.length === 0, "M5 英雄預告時間錯誤。");
    driver.advance(0.7);
    check(bossValues.length === 1, "M5 首領預告時間錯誤。");
    groups++;

    natives.currentSpell = spell(hero); natives.emit("spellChannel");
    driver.advance(0.2); natives.emit("spellEndCast"); driver.advance(1);
    check(heroValues.length === 1 && clock.pendingCount() === 0, "M5 中斷仍送出作用。");
    natives.emit("spellChannel"); driver.advance(0.4);
    natives.currentSpell = { ...spell(hero), targetX: 99 }; natives.emit("spellChannel");
    driver.advance(0.4);
    check(heroValues.length === 1 && clock.pendingCount() === 1, "M5 新施法沒有取消舊預告。");
    driver.advance(0.4);
    check(heroValues.length === 2 && heroValues[1] === 99, "M5 新預告沒有保存施法快照。");
    groups++;

    const uiDriver = new FakeClockDriver(), ui = new Clock(uiDriver);
    const uiValues: number[] = [];
    owner.add(interval(1, { clock: ui }).subscribe(value => uiValues.push(value)));
    natives.currentSpell = spell(boss); natives.emit("spellChannel"); driver.advance(0.5);
    clock.pause(); clock.pause();
    const frozen = clock.nowTicks();
    driver.advance(3); uiDriver.advance(3); clock.resume(); driver.advance(3);
    check(bossValues.length === 1 && clock.nowTicks() === frozen && uiValues.length === 3,
      "M5 世界暫停或介面時鐘錯誤。");
    clock.resume(); driver.advance(0.999);
    check(bossValues.length === 1, "M5 恢復後提早送出。");
    driver.advance(0.001);
    check(bossValues.length === 2, "M5 恢復後沒有依剩餘秒數送出。");
    groups++;

    const messages: string[] = [];
    const shield = installShieldExample(owner, events.onDamaging.ofTarget(target), message => messages.push(message));
    const amounts: number[] = [];
    owner.add(events.onDamaging.ofTarget(target).subscribe(event => amounts.push(event.amount)));
    natives.currentDamage = damage(hero, target, 40); natives.emit("damaging");
    check(shield.shield() === 20 && !shield.depleted() && amounts[0] === 0,
      "M5 增傷與護盾順序錯誤。");
    natives.currentDamage = damage(boss, target, 40); natives.emit("damaging");
    check(shield.shield() === 0 && shield.depleted() && amounts[1] === 60 && messages.length === 5,
      "M5 護盾剩餘傷害或副作用錯誤。");
    check(messages[0] === "M5 增傷：40 → 80" && messages[4] === "M5 護盾耗盡。",
      "M5 修正步驟或耗盡訊息順序錯誤。");
    groups++;

    natives.currentSpell = spell(hero); natives.emit("spellChannel"); clock.pause();
    owner.unsubscribe(); clock.resume(); driver.advance(2); uiDriver.advance(2);
    natives.currentDamage = damage(hero, target, 40); natives.emit("damaging");
    check(clock.pendingCount() === 0 && ui.pendingCount() === 0 && heroValues.length === 2 &&
      uiValues.length === 3 && messages.length === 5 && natives.currentDamage.amount === 40 &&
      !events.onSpellChannel.hasSubscribers() && !events.onSpellEndCast.hasSubscribers() &&
      !events.onDamaging.hasSubscribers(), "M5 取消後仍有訂閱或任務。");
    groups++;
    check(errors.length === 0, "M5 發生未處理錯誤。");
  } finally {
    owner.unsubscribe();
    config.onUnhandledError = saved;
  }
  return groups;
}
