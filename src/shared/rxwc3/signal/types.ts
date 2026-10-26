import { Subscription } from "../core/Subscription";
import { Local, Sync } from "../sync/types";

export interface Signal<T, K extends Sync | Local = Sync> {
  (this: void): T;
  readonly syncKind: K;
}

export interface WritableSignal<T, K extends Sync | Local = Sync> extends Signal<T, K> {
  set(this: void, value: T): void;
  update(this: void, fn: (this: void, value: T) => T): void;
  asReadOnly(this: void): Signal<T, K>;
}

export interface SignalOptions<T> {
  equal?: (this: void, previous: T, current: T) => boolean;
}

export interface LinkedPrevious<S, T> {
  source: S;
  value: T;
}

export interface LinkedOptions<S, T> extends SignalOptions<T> {
  source: (this: void) => S;
  computation: (this: void, source: S, previous: LinkedPrevious<S, NoInfer<T>> | undefined) => T;
}

export type Cleanup = (this: void) => void;
export type OnCleanup = (this: void, cleanup: Cleanup) => void;
export type EffectFunction = (this: void, onCleanup: OnCleanup) => void;

export class EffectRef extends Subscription {
  public destroy(): void {
    this.unsubscribe();
  }
}
