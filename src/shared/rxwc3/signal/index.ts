import { Observable } from "../core/observable";
import { Subscriber } from "../core/subscriber";
import { Subscription } from "../core/subscription";
import { Local, Sync, SyncKind } from "../sync/types";
import { callable, createEffect, createNode, untracked, writableCallable } from "./runtime";
import { EffectFunction, EffectRef, LinkedOptions, LinkedPrevious, Signal, SignalOptions, WritableSignal } from "./types";

export * from "./types";
export { batch, untracked } from "./runtime";

function makeSignal<T, K extends SyncKind>(kind: K, value: T, options?: SignalOptions<T>): WritableSignal<T, K> {
  return writableCallable(createNode(kind, value, options));
}

export function signal<T>(value: T, options?: SignalOptions<T>): WritableSignal<T> {
  return makeSignal("sync", value, options);
}

export function localSignal<T>(value: T, options?: SignalOptions<T>): WritableSignal<T, Local> {
  return makeSignal("local", value, options);
}

function makeComputed<T, K extends SyncKind>(kind: K, fn: (this: void) => T, options?: SignalOptions<T>): Signal<T, K> {
  return callable(createNode<T>(kind, undefined as T, options, fn));
}

export function computed<T>(fn: (this: void) => T, options?: SignalOptions<T>): Signal<T> {
  return makeComputed("sync", fn, options);
}

export function localComputed<T>(fn: (this: void) => T, options?: SignalOptions<T>): Signal<T, Local> {
  return makeComputed("local", fn, options);
}

function makeLinked<S, T, K extends SyncKind>(kind: K, input: ((this: void) => T) | LinkedOptions<S, T>, options?: SignalOptions<T>): WritableSignal<T, K> {
  let previous: LinkedPrevious<S, T> | undefined;
  const simple = typeof input === "function" || (input as LinkedOptions<S, T>).computation === undefined;
  const specification = input as LinkedOptions<S, T>;
  const calculate = simple ? input as (this: void) => T : () => {
    const source = specification.source();
    const value = specification.computation(source, previous);
    previous = { source, value };
    return value;
  };
  const node = createNode<T>(kind, undefined as T, simple ? options : specification, calculate);
  // 手動寫入後，下一次計算收到目前值與上一次來源。
  if (!simple) {
    node.calculate = () => {
      if (previous !== undefined) {
        previous = { source: previous.source, value: node.value };
      }
      return calculate();
    };
  }
  return writableCallable(node);
}

export function linkedSignal<T>(fn: (this: void) => T, options?: SignalOptions<T>): WritableSignal<T>;
export function linkedSignal<S, T>(options: LinkedOptions<S, T>): WritableSignal<T>;
export function linkedSignal<S, T>(input: ((this: void) => T) | LinkedOptions<S, T>, options?: SignalOptions<T>): WritableSignal<T> {
  return makeLinked("sync", input, options);
}

export function localLinkedSignal<T>(fn: (this: void) => T, options?: SignalOptions<T>): WritableSignal<T, Local>;
export function localLinkedSignal<S, T>(options: LinkedOptions<S, T>): WritableSignal<T, Local>;
export function localLinkedSignal<S, T>(input: ((this: void) => T) | LinkedOptions<S, T>, options?: SignalOptions<T>): WritableSignal<T, Local> {
  return makeLinked("local", input, options);
}

export function effect(fn: EffectFunction): EffectRef {
  return createEffect("sync", fn);
}

export function localEffect(fn: EffectFunction): EffectRef {
  return createEffect("local", fn);
}

export function toSignal<T, K extends SyncKind, O extends SyncKind>(source: Observable<T, K>, initial: T, options: { owner?: Subscription; syncKind: O }): Signal<T, O>;
export function toSignal<T, K extends SyncKind>(source: Observable<T, K>, initial: T, options?: { owner?: Subscription; syncKind?: K }): Signal<T, K>;
export function toSignal<T, K extends SyncKind>(source: Observable<T, K>, initial: T, options?: { owner?: Subscription; syncKind?: SyncKind }): Signal<T, SyncKind> {
  // 一般串流的 K 在執行時不存在。呼叫端可明確提供本地標記。
  // M4 的明確選項可覆寫標記；其餘來源讀取統一的執行時標記。
  const kind = options?.syncKind ?? source.runtimeSyncKind ?? "sync";
  const node = createNode(kind, initial);
  const target = writableCallable<T, SyncKind>(node);
  const subscriber = new Subscriber<T>({ next: value => target.set(value) });
  // 先連接擁有者，讓同步來源也能即時停止。
  options?.owner?.add(subscriber);
  untracked(() => source.subscribe(subscriber));
  return target.asReadOnly();
}

export function toObservable<T, K extends SyncKind>(source: Signal<T, K>): Observable<T, K> {
  const result = new Observable<T, K>(subscriber => {
    createEffect(source.syncKind, () => {
      const value = source();
      untracked(() => subscriber.next(value));
    }, subscriber);
  }, source.syncKind);
  return result;
}
