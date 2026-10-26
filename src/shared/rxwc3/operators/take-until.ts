import { Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { SyncKind } from "../sync/types";

export function takeUntil<T>(notifier: Observable<any, SyncKind>): OperatorFunction<T, T> {
  return source => new Observable(subscriber => {
    notifier.subscribe(operatorSubscriber(subscriber, () => subscriber.complete(), () => {}));
    if (!subscriber.closed) {
      source.subscribe(operatorSubscriber<T>(subscriber, value => subscriber.next(value)));
    }
  });
}
