import { Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

export function takeWhile<T>(predicate: (this: void, value: T, index: number) => boolean): OperatorFunction<T, T> {
  return source => new Observable(subscriber => {
    let index = 0;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (predicate(value, index++)) {
        subscriber.next(value);
      } else {
        subscriber.complete();
      }
    }));
  });
}
