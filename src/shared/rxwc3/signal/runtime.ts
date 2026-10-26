import { config, reportUnhandledError as reportCoreError } from "../core/config";
import { SyncKind } from "../sync/types";
import { Cleanup, EffectFunction, EffectRef, Signal, SignalOptions, WritableSignal } from "./types";

/**
 * Lua 使用可呼叫的資料表。Node 使用函式物件。
 *
 * 用途：signal 必須同時支援 `s()` 與 `s.set(v)`。JS 的函式可以有欄位，Lua 的函式不可以。
 * 所以在 Lua 中，signal 是含 `__call` 的資料表。資料表放 `set` 等欄位，`__call` 讓它可以被呼叫。
 *
 * 這是型別宣告，不產生程式碼。`tsconfig.test.json` 只載入 Node 型別，沒有 `lua-types`，
 * 所以必須在這裡宣告。本檔是模組，所以宣告只在本檔有效。TSTL 轉譯後直接呼叫 Lua 的全域 `setmetatable`。
 *
 * `__call` 的第一個參數是資料表本身（Lua 的規則）。`this: void` 使 TSTL 不再加入另一個 `self` 參數。
 */
declare function setmetatable(this: void, table: object, meta: {
  __call: (this: void, self: unknown) => unknown;
}): unknown;

/*
 * 依賴圖使用「推拉混合」模型：
 * - 推（push）：寫入時，`invalidate` 沿 `consumers` 把下游標記為 `dirty`，並把 effect 加入佇列。不計算新值。
 * - 拉（pull）：讀取或執行 effect 時，`refresh`/`changed` 比較 `Dependency.version`，只重算真的改變的節點。
 * 所以菱形依賴不會產生中間值（glitch-free），未被讀取的 computed 也不會計算。
 */

/**
 * 一條「讀取記錄」：某個 Consumer 讀過某個節點，以及讀取時該節點的版本。
 * `changed()` 比較 `version` 與節點目前的版本，判斷 Consumer 是否需要重算。
 */
interface Dependency {
  /** 被讀取的節點。 */
  node: ValueNode;
  /** 讀取時節點的 `version`。 */
  version: number;
}

/**
 * 會讀取 signal 的一方：computed／linkedSignal 的計算，或 effect。
 * 每次重新執行前，`detach()` 清除舊依賴，執行中重新登記。所以依賴是動態的。
 */
interface Consumer {
  /** 同步性。同步的 Consumer 讀取本地節點時，`read()` 報告錯誤。 */
  kind: SyncKind;
  /** 上一次執行時讀取的節點（拉的方向）。 */
  dependencies: Dependency[];
  /** 上游可能已改變。由 `invalidate()` 設定，重算或確認未改變後清除。 */
  dirty: boolean;
  /** Consumer 是 effect 時，指向其狀態。 */
  effect?: EffectState;
  /** Consumer 是 computed／linkedSignal 時，指向計算結果所在的節點。 */
  output?: ValueNode;
}

/**
 * 保存一個值的節點。`signal`、`computed`、`linkedSignal` 都以它為核心，
 * `callable()` 再把它包成可呼叫的物件。
 */
export interface ValueNode {
  /** 同步性。 */
  kind: SyncKind;
  /** 目前的值。computed 在 `refresh()` 後才是最新值。 */
  value: any;
  /** 值改變（`equal` 判斷為不同）時加 1。下游用它判斷是否需要重算。 */
  version: number;
  /** 是否已有值。computed 建立時為 `false`，第一次讀取才計算（延遲計算）。 */
  initialized: boolean;
  /** 依賴本節點的 Consumer（推的方向）。 */
  consumers: Set<Consumer>;
  /** 衍生節點（computed／linkedSignal）自己的計算角色。一般 signal 沒有。 */
  consumer?: Consumer;
  /** 衍生節點的計算函式。 */
  calculate?: (this: void) => any;
  /** 判斷新舊值是否相同。相同時不增加 `version`，也不通知下游。 */
  equal: (this: void, previous: any, current: any) => boolean;
  /** 正在計算。計算中再次讀取自己時，表示有循環依賴。 */
  evaluating: boolean;
}

/** 一個 effect 的執行狀態。 */
interface EffectState {
  /** effect 讀取 signal 時使用的 Consumer。 */
  consumer: Consumer;
  /** 傳回給使用者的參照。`destroy()` 後 `closed` 為 `true`，不再執行。 */
  ref: EffectRef;
  /** 使用者的 effect 函式。 */
  fn: EffectFunction;
  /** 經由 `onCleanup` 登記的清理函式。下一次執行前或 `destroy()` 時執行。 */
  cleanups: Cleanup[];
  /** 已在佇列中。避免同一輪重複加入。 */
  queued: boolean;
  /** 尚未執行過。第一次執行不檢查依賴是否改變。 */
  initial: boolean;
}

let active: Consumer | undefined;
let executing: Consumer | undefined;
let calculationDepth = 0;
let batchDepth = 0;
let flushing = false;
let queue: EffectState[] = [];

function reportUnhandledError(error: unknown): void {
  const previousActive = active;
  const previousExecuting = executing;
  active = undefined;
  executing = undefined;
  try {
    reportCoreError(error);
  } finally {
    active = previousActive;
    executing = previousExecuting;
  }
}

function detach(consumer: Consumer): void {
  for (const dependency of consumer.dependencies) {
    dependency.node.consumers.delete(consumer);
  }
  consumer.dependencies = [];
}

function enqueue(state: EffectState): void {
  if (!state.queued && !state.ref.closed) {
    state.queued = true;
    queue.push(state);
  }
}

function invalidate(node: ValueNode, visited: Set<Consumer> = new Set()): void {
  for (const consumer of node.consumers) {
    if (visited.has(consumer)) {
      continue;
    }
    visited.add(consumer);
    consumer.dirty = true;
    if (consumer.output !== undefined) {
      invalidate(consumer.output, visited);
    }
    if (consumer.effect !== undefined) {
      enqueue(consumer.effect);
    }
  }
}

function changed(consumer: Consumer): boolean {
  let result = false;
  // 全部來源都先更新，再決定是否需要重跑。
  for (const dependency of consumer.dependencies) {
    refresh(dependency.node);
    if (dependency.version !== dependency.node.version) {
      result = true;
    }
  }
  return result;
}

function refresh(node: ValueNode): void {
  const consumer = node.consumer;
  if (consumer === undefined || (!consumer.dirty && node.initialized)) {
    return;
  }
  if (node.evaluating) {
    throw new Error("Signal 有循環計算依賴。");
  }
  node.evaluating = true;
  const previousActive = active;
  const previousExecuting = executing;
  active = undefined;
  executing = undefined;
  try {
    if (node.initialized && !changed(consumer)) {
      consumer.dirty = false;
      return;
    }
    detach(consumer);
    active = consumer;
    executing = consumer;
    calculationDepth++;
    let value: any;
    try {
      value = node.calculate!();
    } finally {
      calculationDepth--;
    }
    if (!node.initialized || !untracked(() => node.equal(node.value, value))) {
      node.value = value;
      node.version++;
    }
    node.initialized = true;
    consumer.dirty = false;
  } finally {
    active = previousActive;
    executing = previousExecuting;
    node.evaluating = false;
  }
}

export function read(node: ValueNode): any {
  if (executing !== undefined && config.checkSignalSync && executing.kind === "sync" && node.kind === "local") {
    reportUnhandledError(new Error("同步計算不得讀取本地 Signal。"));
  }
  // 先登記依賴，讓計算失敗後仍能由來源變更觸發重試。
  let dependency: Dependency | undefined;
  if (active !== undefined) {
    dependency = active.dependencies.find(item => item.node === node);
    if (dependency === undefined) {
      dependency = { node, version: node.version };
      active.dependencies.push(dependency);
      node.consumers.add(active);
    }
  }
  refresh(node);
  if (dependency !== undefined) {
    dependency.version = node.version;
  }
  return node.value;
}

export function writable(): boolean {
  if (calculationDepth > 0) {
    reportUnhandledError(new Error("衍生計算內不得寫入 Signal。"));
    return false;
  }
  return true;
}

export function write(node: ValueNode, value: any): void {
  if (!writable()) {
    return;
  }
  refresh(node);
  if (untracked(() => node.equal(node.value, value))) {
    return;
  }
  node.value = value;
  node.version++;
  invalidate(node);
  flush();
}

function cleanup(state: EffectState): void {
  const cleanups = state.cleanups;
  state.cleanups = [];
  untracked(() => {
    for (const callback of cleanups) {
      try {
        callback();
      } catch (error) {
        reportUnhandledError(error);
      }
    }
  });
}

function run(state: EffectState, counts?: Map<EffectState, number>): void {
  const consumer = state.consumer;
  const previousActive = active;
  const previousExecuting = executing;
  active = undefined;
  executing = undefined;
  try {
    if (!state.initial && !changed(consumer)) {
      consumer.dirty = false;
      return;
    }
    if (counts !== undefined) {
      const count = (counts.get(state) ?? 0) + 1;
      counts.set(state, count);
      if (count > 100) {
        // 停止循環的副作用，其他副作用仍可執行。
        state.ref.destroy();
        reportUnhandledError(new Error("同一輪的副作用執行超過 100 次，已停止。"));
        return;
      }
    }
    state.initial = false;
    detach(consumer);
    consumer.dirty = false;
    cleanup(state);
    if (state.ref.closed) {
      return;
    }
    active = consumer;
    executing = consumer;
    state.fn(callback => {
      if (state.ref.closed) {
        untracked(callback);
      } else {
        state.cleanups.push(callback);
      }
    });
  } catch (error) {
    reportUnhandledError(error);
  } finally {
    active = previousActive;
    executing = previousExecuting;
    if (state.ref.closed) {
      detach(consumer);
    }
  }
}

function flush(): void {
  if (flushing || batchDepth > 0) {
    return;
  }
  flushing = true;
  const counts = new Map<EffectState, number>();
  let index = 0;
  try {
    while (index < queue.length) {
      const state = queue[index++];
      state.queued = false;
      if (!state.ref.closed) {
        run(state, counts);
      }
    }
  } finally {
    queue = [];
    flushing = false;
  }
}

export function createNode<T>(kind: SyncKind, value: T, options?: SignalOptions<T>, calculate?: (this: void) => T): ValueNode {
  const node: ValueNode = {
    kind, value, version: 0, initialized: calculate === undefined,
    consumers: new Set(), calculate, evaluating: false,
    equal: options?.equal ?? ((previous, current) => previous === current),
  };
  if (calculate !== undefined) {
    node.consumer = { kind, dependencies: [], dirty: true, output: node };
  }
  return node;
}

export function callable<T, K extends SyncKind>(node: ValueNode): Signal<T, K> {
  let result: Signal<T, K>;
  // Lua（WC3）有 `setmetatable`：建立含 `__call` 的資料表。
  // Node（單元測試）沒有 `setmetatable`：使用箭頭函式，再直接加入方法。
  if (typeof setmetatable === "function") {
    result = setmetatable({}, { __call: (_self: unknown) => read(node) }) as Signal<T, K>;
  } else {
    result = (() => read(node)) as Signal<T, K>;
  }
  (result as { syncKind: SyncKind }).syncKind = node.kind;
  return result;
}

export function writableCallable<T, K extends SyncKind>(node: ValueNode): WritableSignal<T, K> {
  const result = callable<T, K>(node) as WritableSignal<T, K>;
  let readOnly: Signal<T, K> | undefined;
  result.set = value => write(node, value);
  result.update = fn => {
    if (writable()) {
      write(node, untracked(() => fn(read(node))));
    }
  };
  result.asReadOnly = () => {
    if (readOnly === undefined) {
      readOnly = callable<T, K>(node);
    }
    return readOnly;
  };
  return result;
}

export function createEffect(kind: SyncKind, fn: EffectFunction, owner?: SubscriptionOwner): EffectRef {
  const consumer: Consumer = { kind, dependencies: [], dirty: false };
  const ref = new EffectRef();
  const state: EffectState = { consumer, ref, fn, cleanups: [], queued: false, initial: true };
  consumer.effect = state;
  ref.add(() => {
    detach(consumer);
    cleanup(state);
  });
  owner?.add(ref);
  if (!ref.closed) {
    // 建立時立即執行，但將其中的寫入併入同一輪。
    if (flushing || batchDepth > 0) {
      run(state);
    } else {
      enqueue(state);
      flush();
    }
  }
  return ref;
}

interface SubscriptionOwner {
  add(teardown: EffectRef): void;
}

export function untracked<T>(fn: (this: void) => T): T {
  const previousActive = active;
  active = undefined;
  try {
    return fn();
  } finally {
    active = previousActive;
  }
}

export function batch<T>(fn: (this: void) => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    flush();
  }
}
