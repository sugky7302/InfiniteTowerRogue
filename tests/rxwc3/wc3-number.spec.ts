import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Clock, interval, Phase, Scheduler, take, timer } from "../../src/shared/rxwc3";
import { addTicks, MAX_SECONDS, MAX_TICKS, toTicks } from "../../src/shared/rxwc3/scheduler/time";
import { FakeClockDriver } from "./fake-clock-driver";
import { int32, Wc3TimerModel } from "./wc3-timer-model";

test("shared 原始碼不得使用 WC3 不支援的數字常數", () => {
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else assert.doesNotMatch(readFileSync(path, "utf8"), /MAX_SAFE_INTEGER|MAX_VALUE|EPSILON|2\s*(?:\*\*|\^)\s*(?:53|1024)\b/, path);
    }
  };
  visit(join(process.cwd(), "src/shared"));
});

test("WC3 秒數換算保留整數乘法，毫秒與上限均在 int32 範圍", () => {
  for (const seconds of [12, 1080, 7200, 16777, MAX_SECONDS, -MAX_SECONDS]) {
    // 模擬 Lua：floor 傳回 int32，只有小數部分用 float32 計算。
    const input = Math.fround(seconds);
    const whole = int32(Math.floor(input));
    const fraction = Math.fround(Math.fround(input - whole) * 1000);
    const expected = int32(int32(whole * 1000) + int32(Math.floor(Math.fround(fraction + 0.5))));
    assert.equal(toTicks(input), expected);
  }
  assert.equal(toTicks(0.0016), 2);
  assert.equal(toTicks(-0.0016), -2);
  assert.equal(toTicks(MAX_SECONDS), MAX_TICKS);
  for (const seconds of [MAX_SECONDS + 1, -MAX_SECONDS - 1, NaN, Infinity]) {
    assert.throws(() => toTicks(seconds), /有限秒數/);
  }
  assert.equal(addTicks(MAX_TICKS - 1, 1), MAX_TICKS);
  assert.throws(() => addTicks(MAX_TICKS, 1), /上限/);
  assert.throws(() => addTicks(-MAX_TICKS, -1), /上限/);
  const scheduler = new Scheduler();
  for (const ticks of [2147483648, -2147483649, 0.5, NaN]) {
    assert.throws(() => scheduler.schedule(ticks, Phase.Default, () => {}), /整數毫秒/);
  }
});

for (const seconds of [1080, 7200]) {
  test(`WC3 float32 驅動器可完成 ${seconds} 秒排程`, () => {
    const model = new Wc3TimerModel();
    try {
      let fired = -1;
      timer(Math.fround(seconds), { clock: model.clock }).subscribe(() => { fired = model.clock.nowTicks(); });
      assert.equal(model.timerCount(), 2);
      model.advance(seconds - 0.01);
      assert.equal(fired, -1);
      model.advance(0.02);
      assert.equal(fired, seconds * 1000);
      assert.equal(model.clock.pendingCount(), 0);
      assert.equal(model.driver.hasWakeTimer(), false);
      assert.equal(model.timerCount(), 1);
    } finally { model.restore(); }
  });
}

test("WC3 float32 的 interval 經過兩小時仍以整數毫秒到期，不累積週期誤差", () => {
  const model = new Wc3TimerModel();
  try {
    let count = 0;
    let error: unknown;
    interval(Math.fround(0.1), { clock: model.clock }).pipe(take(72000)).subscribe(index => {
      count++;
      assert.equal(index, count - 1);
      assert.equal(model.clock.nowTicks(), int32(count * 100));
    }, caught => { error = caught; });
    model.advance(7200.01);
    assert.equal(error, undefined);
    assert.equal(count, 72000);
    assert.equal(model.clock.pendingCount(), 0);
    assert.equal(model.timerCount(), 1);
  } finally { model.restore(); }
});

test("WC3 float32 閒置兩小時仍量時，暫停與引用計數不增加時間", () => {
  const model = new Wc3TimerModel();
  try {
    assert.equal(model.timerCount(), 1);
    model.advance(7200.125);
    assert.equal(model.clock.nowTicks(), 7200125);
    assert.equal(model.clock.now(), 7200.125);
    model.clock.pause(); model.clock.pause();
    assert.equal(model.timerCount(), 0);
    model.advance(1080); model.clock.resume(); model.advance(1080);
    assert.equal(model.clock.nowTicks(), 7200125);
    model.clock.resume(); model.advance(0.875);
    assert.equal(model.clock.nowTicks(), 7201000);
    let fired = false;
    const task = model.clock.schedule(12, () => { fired = true; });
    task.unsubscribe();
    model.advance(12);
    assert.equal(fired, false);
    assert.equal(model.clock.nowTicks(), 7213000);
    assert.equal(model.timerCount(), 1);
  } finally { model.restore(); }
});

test("WC3 float32 接近 24.8 天仍保留毫秒，不經過浮點秒重排", () => {
  const model = new Wc3TimerModel();
  try {
    model.advance(2147400);
    let fired = -1;
    model.clock.schedule(0.003, () => { fired = model.clock.nowTicks(); });
    model.advance(0.004);
    assert.equal(fired, 2147400003);
    assert.throws(() => model.clock.schedule(84, () => {}), /上限/);
    assert.equal(model.clock.pendingCount(), 0);
  } finally { model.restore(); }
});

test("時鐘與 interval 在超過時間上限前報錯，並清理週期任務", () => {
  const driver = new FakeClockDriver();
  const clock = new Clock(driver);
  driver.advance(MAX_SECONDS - 1);
  assert.throws(() => clock.schedule(2, () => {}), /上限/);
  let error: unknown;
  let count = 0;
  interval(1, { clock }).subscribe({ next: () => { count++; }, error: caught => { error = caught; } });
  driver.advance(1);
  assert.equal(count, 1);
  assert.ok(error instanceof Error);
  assert.match(error.message, /上限/);
  assert.equal(clock.pendingCount(), 0);
  assert.equal(driver.isArmed(), false);
  driver.advance(1);
  assert.throws(() => clock.now(), /有限秒數/);
});
