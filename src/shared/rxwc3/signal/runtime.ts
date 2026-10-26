import { config, reportUnhandledError as reportCoreError } from "../core/config";
import { SyncKind } from "../sync/types";
import { Cleanup, EffectFunction, EffectRef, Signal, SignalOptions, WritableSignal } from "./types";

// Lua 使用可呼叫的資料表。Node 使用函式物件。
declare function setmetatable(this: void, table: object, meta: {
  __call: (this: void, self: unknown) => unknown;
}): unknown;

interface Dependency {
  node: ValueNode;
  version: number;
}

interface Consumer {
  kind: SyncKind;
  dependencies: Dependency[];
  dirty: boolean;
  effect?: EffectState;
  output?: ValueNode;
}

export interface ValueNode {
  kind: SyncKind;
  value: any;
  version: number;
  initialized: boolean;
  consumers: Set<Consumer>;
  consumer?: Consumer;
  calculate?: (this: void) => any;
  equal: (this: void, previous: any, current: any) => boolean;
  evaluating: boolean;
}

interface EffectState {
  consumer: Consumer;
  ref: EffectRef;
  fn: EffectFunction;
  cleanups: Cleanup[];
  queued: boolean;
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
