import { checkInnerSync, deriveObservable, FlattenOperatorFunction, Observable } from "../core/observable";
import { operatorSubscriber, Subscriber } from "../core/subscriber";
import { SyncKind } from "../sync/types";

/** 內層可能是本地時，請在建立時傳入 innerSyncKind 為 local。 */
export function switchMap<T, R, I extends SyncKind>(project: (this: void, value: T, index: number) => Observable<R, I>, innerSyncKind: I = "sync" as I): FlattenOperatorFunction<T, R, I> {
  return source => deriveObservable(source, subscriber => {
    let innerSubscriber: Subscriber<R> | undefined;
    let outerComplete = false;
    let index = 0;
    let generation = 0;
    let projecting = false;
    const checkComplete = () => {
      if (outerComplete && !projecting && innerSubscriber === undefined) {
        subscriber.complete();
      }
    };
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      const currentGeneration = ++generation;
      const previous = innerSubscriber;
      innerSubscriber = undefined;
      projecting = true;
      if (previous !== undefined) {
        previous.unsubscribe();
      }
      if (subscriber.closed || currentGeneration !== generation) {
        return;
      }
      const inner = project(value, index++);
      checkInnerSync(source, inner, innerSyncKind);
      if (subscriber.closed || currentGeneration !== generation) {
        return;
      }
      const current = operatorSubscriber<R>(subscriber, item => subscriber.next(item), () => {
        if (innerSubscriber === current) {
          innerSubscriber = undefined;
        }
        checkComplete();
      });
      innerSubscriber = current;
      projecting = false;
      inner.subscribe(current);
    }, () => {
      outerComplete = true;
      checkComplete();
    }));
  }, innerSyncKind);
}
