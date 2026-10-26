import { FlattenOperatorFunction, Observable } from "../core/observable";
import { operatorSubscriber, Subscriber } from "../core/subscriber";
import { SyncKind } from "../sync/types";

export function switchMap<T, R, I extends SyncKind>(project: (this: void, value: T, index: number) => Observable<R, I>): FlattenOperatorFunction<T, R, I> {
  return source => new Observable(subscriber => {
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
  });
}
