import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

export function take<T>(count: number): OperatorFunction<T, T> {
  return source => deriveObservable(source, subscriber => {
    if (count <= 0) {
      subscriber.complete();
      return;
    }
    let seen = 0;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (++seen <= count) {
        subscriber.next(value);
        if (seen >= count) {
          subscriber.complete();
        }
      }
    }));
  });
}
