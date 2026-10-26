import { Observable, OperatorFunction } from "../core/Observable";
import { operatorSubscriber } from "../core/Subscriber";

export function take<T>(count: number): OperatorFunction<T, T> {
  return source => new Observable(subscriber => {
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
