import { FlattenOperatorFunction, Observable } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { SyncKind } from "../sync/types";

export function mergeMap<T, R, I extends SyncKind>(project: (this: void, value: T, index: number) => Observable<R, I>): FlattenOperatorFunction<T, R, I> {
  return source => new Observable(subscriber => {
    let active = 0;
    let outerComplete = false;
    let index = 0;
    const checkComplete = () => {
      if (outerComplete && active === 0) {
        subscriber.complete();
      }
    };
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      active++;
      const inner = project(value, index++);
      inner.subscribe(operatorSubscriber<R>(subscriber, item => subscriber.next(item), () => {
        active--;
        checkComplete();
      }));
    }, () => {
      outerComplete = true;
      checkComplete();
    }));
  });
}
