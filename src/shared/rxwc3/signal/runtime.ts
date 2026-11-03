import { protectedCall } from "../core/protected-call";
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
declare function setmetatable(
    this: void,
    table: object,
    meta: {
        __call: (this: void, self: unknown) => unknown;
    },
): unknown;

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
    consumer: Consumer;
    /** 被讀取的節點。 */
    node: ValueNode;
    /** 讀取時節點的 `version`。 */
    version: number;
    seen: boolean;
    previous?: Dependency;
    next?: Dependency;
}

/**
 * 會讀取 signal 的一方：computed／linkedSignal 的計算，或 effect。
 * 每次重新執行前，先斷開舊依賴，讀取時接回連結。執行後移除未讀取的記錄。
 */
interface Consumer {
    /** 同步性。同步的 Consumer 讀取本地節點時，`read()` 報告錯誤。 */
    kind: SyncKind;
    /** 上一次執行時讀取的節點（拉的方向）。 */
    dependencies: Dependency[];
    dependencyMap: Map<ValueNode, Dependency>;
    cursor: number;
    tracking: boolean;
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
    /** 依讀取順序排列的反向連結。重用連結，避免反覆配置 Set 項目。 */
    firstConsumer?: Dependency;
    lastConsumer?: Dependency;
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
    onCleanup: (this: void, callback: Cleanup) => void;
}

let active: Consumer | undefined;
let executing: Consumer | undefined;
/** 即使 untracked 停止追蹤，也保留目前計算的本地性。 */
export function isLocalSignalExecution(): boolean {
    return executing?.kind === "local";
}
let calculationDepth = 0;
let batchDepth = 0;
let flushing = false;
const queue: EffectState[] = [];
const visited = new Set<Consumer>();
const counts = new Map<EffectState, number>();

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
    for (const dependency of consumer.dependencies) unlink(dependency);
    consumer.dependencies.length = 0;
    consumer.dependencyMap.clear();
}

function unlink(dependency: Dependency): void {
    if (!dependency.seen) return;
    const node = dependency.node;
    if (dependency.previous === undefined) node.firstConsumer = dependency.next;
    else dependency.previous.next = dependency.next;
    if (dependency.next === undefined) node.lastConsumer = dependency.previous;
    else dependency.next.previous = dependency.previous;
    dependency.previous = undefined;
    dependency.next = undefined;
    dependency.seen = false;
}

/** 保留依賴記錄與索引。重新讀取時接回尾端，保留原有通知順序。 */
function beginTracking(consumer: Consumer): void {
    consumer.cursor = 0;
    consumer.tracking = true;
    for (const dependency of consumer.dependencies) {
        unlink(dependency);
    }
}

function endTracking(consumer: Consumer): void {
    if (!consumer.tracking) return;
    consumer.tracking = false;
    let count = 0;
    for (const dependency of consumer.dependencies) {
        if (dependency.seen) consumer.dependencies[count++] = dependency;
        else {
            consumer.dependencyMap.delete(dependency.node);
        }
    }
    consumer.dependencies.length = count;
}

function enqueue(state: EffectState): void {
    if (!state.queued && !state.ref.closed) {
        state.queued = true;
        queue.push(state);
    }
}

function invalidate(node: ValueNode): void {
    let dependency = node.firstConsumer;
    while (dependency !== undefined) {
        const consumer = dependency.consumer;
        if (!visited.has(consumer)) {
            visited.add(consumer);
            consumer.dirty = true;
            if (consumer.output !== undefined) invalidate(consumer.output);
            if (consumer.effect !== undefined) enqueue(consumer.effect);
        }
        dependency = dependency.next;
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

/** 比較期間不追蹤依賴。錯誤仍交由原呼叫者處理。 */
function equal(node: ValueNode, value: any): boolean {
    if (node.equal === defaultEqual) return node.value === value;
    const previousActive = active;
    active = undefined;
    const [ok, result] = protectedCall(node.equal, node.value, value);
    active = previousActive;
    if (!ok) throw result;
    return result;
}

function refreshValue(this: void, node: ValueNode, consumer: Consumer): void {
    if (node.initialized && !changed(consumer)) {
        consumer.dirty = false;
        return;
    }
    beginTracking(consumer);
    active = consumer;
    executing = consumer;
    calculationDepth++;
    const value = node.calculate!();
    calculationDepth--;
    if (!node.initialized || !equal(node, value)) {
        node.value = value;
        node.version++;
    }
    node.initialized = true;
    consumer.dirty = false;
}

function refresh(node: ValueNode): void {
    const consumer = node.consumer;
    if (consumer === undefined || (!consumer.dirty && node.initialized)) return;
    if (node.evaluating) throw new Error("Signal 有循環計算依賴。");
    node.evaluating = true;
    const previousActive = active;
    const previousExecuting = executing;
    const previousDepth = calculationDepth;
    active = undefined;
    executing = undefined;
    const [ok, error] = protectedCall(refreshValue, node, consumer);
    endTracking(consumer);
    active = previousActive;
    executing = previousExecuting;
    calculationDepth = previousDepth;
    node.evaluating = false;
    if (!ok) throw error;
}

export function read(node: ValueNode): any {
    if (
        executing !== undefined &&
        config.checkSignalSync &&
        executing.kind === "sync" &&
        node.kind === "local"
    ) {
        reportUnhandledError(new Error("同步計算不得讀取本地 Signal。"));
    }
    // 先登記依賴，讓計算失敗後仍能由來源變更觸發重試。
    let dependency: Dependency | undefined;
    if (active !== undefined) {
        const candidate = active.dependencies[active.cursor];
        dependency = candidate?.node === node ? candidate : active.dependencyMap.get(node);
        if (dependency === undefined) {
            dependency = { node, version: node.version, seen: false, consumer: active };
            active.dependencies.push(dependency);
            active.dependencyMap.set(node, dependency);
        }
        if (!dependency.seen) {
            dependency.seen = true;
            dependency.previous = node.lastConsumer;
            if (node.lastConsumer === undefined) node.firstConsumer = dependency;
            else node.lastConsumer.next = dependency;
            node.lastConsumer = dependency;
        }
        active.cursor++;
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
    if (equal(node, value)) {
        return;
    }
    node.value = value;
    node.version++;
    invalidate(node);
    // 走訪不呼叫使用者程式。先清除，巢狀寫入才不會共用舊標記。
    visited.clear();
    flush();
}

function cleanup(state: EffectState): void {
    const cleanups = state.cleanups;
    state.cleanups = [];
    const previousActive = active;
    active = undefined;
    for (const callback of cleanups) {
        const [ok, error] = protectedCall(callback);
        if (!ok) reportUnhandledError(error);
    }
    active = previousActive;
}

function runEffect(this: void, state: EffectState, runCounts?: Map<EffectState, number>): void {
    const consumer = state.consumer;
    if (!state.initial && !changed(consumer)) {
        consumer.dirty = false;
        return;
    }
    if (runCounts !== undefined) {
        const count = (runCounts.get(state) ?? 0) + 1;
        runCounts.set(state, count);
        if (count > 100) {
            state.ref.destroy();
            reportUnhandledError(new Error("同一輪的副作用執行超過 100 次，已停止。"));
            return;
        }
    }
    state.initial = false;
    beginTracking(consumer);
    consumer.dirty = false;
    cleanup(state);
    if (state.ref.closed) return;
    active = consumer;
    executing = consumer;
    state.fn(state.onCleanup);
}

function run(state: EffectState, runCounts?: Map<EffectState, number>): void {
    const previousActive = active;
    const previousExecuting = executing;
    active = undefined;
    executing = undefined;
    const [ok, error] = protectedCall(runEffect, state, runCounts);
    endTracking(state.consumer);
    // 錯誤處理器不得成為依賴，也不得繼承 effect 的本地狀態。
    if (!ok) reportUnhandledError(error);
    active = previousActive;
    executing = previousExecuting;
    if (state.ref.closed) detach(state.consumer);
}

function drain(this: void): void {
    let index = 0;
    while (index < queue.length) {
        const state = queue[index++];
        state.queued = false;
        if (!state.ref.closed) run(state, counts);
    }
}

function flush(): void {
    if (flushing || batchDepth > 0) return;
    flushing = true;
    const [ok, error] = protectedCall(drain);
    queue.length = 0;
    counts.clear();
    flushing = false;
    if (!ok) throw error;
}

function defaultEqual(this: void, previous: any, current: any): boolean {
    return previous === current;
}

export function createNode<T>(
    kind: SyncKind,
    value: T,
    options?: SignalOptions<T>,
    calculate?: (this: void) => T,
): ValueNode {
    const node: ValueNode = {
        kind,
        value,
        version: 0,
        initialized: calculate === undefined,
        calculate,
        evaluating: false,
        equal: options?.equal ?? defaultEqual,
    };
    if (calculate !== undefined) {
        node.consumer = {
            kind,
            dependencies: [],
            dependencyMap: new Map(),
            cursor: 0,
            tracking: false,
            dirty: true,
            output: node,
        };
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
    result.set = (value) => write(node, value);
    result.update = (fn) => {
        if (writable()) {
            const previousActive = active;
            active = undefined;
            const [ok, value] = protectedCall(updateValue, node, fn);
            active = previousActive;
            if (!ok) throw value;
            write(node, value);
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

function updateValue(this: void, node: ValueNode, fn: (this: void, value: any) => any): any {
    return fn(read(node));
}

export function createEffect(
    kind: SyncKind,
    fn: EffectFunction,
    owner?: SubscriptionOwner,
): EffectRef {
    const consumer: Consumer = {
        kind,
        dependencies: [],
        dependencyMap: new Map(),
        cursor: 0,
        tracking: false,
        dirty: false,
    };
    const ref = new EffectRef();
    const state: EffectState = {
        consumer,
        ref,
        fn,
        cleanups: [],
        queued: false,
        initial: true,
        onCleanup: (callback) => {
            if (ref.closed) untracked(callback);
            else state.cleanups.push(callback);
        },
    };
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
    const [ok, result] = protectedCall(fn);
    active = previousActive;
    if (!ok) throw result;
    return result;
}

export function batch<T>(fn: (this: void) => T): T {
    batchDepth++;
    const [ok, result] = protectedCall(fn);
    batchDepth--;
    flush();
    if (!ok) throw result;
    return result;
}
