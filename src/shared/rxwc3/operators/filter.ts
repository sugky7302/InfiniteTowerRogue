import { Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

export function filter<T, S extends T>(predicate: (this: void, value: T, index: number) => value is S): OperatorFunction<T, S>;
export function filter<T>(predicate: (this: void, value: T, index: number) => boolean): OperatorFunction<T, T>;
export function filter<T>(predicate: (this: void, value: T, index: number) => boolean): OperatorFunction<T, T> {
  return source => new Observable(subscriber => {
    let index = 0;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (predicate(value, index++)) {
        subscriber.next(value);
      }
    }));
  });
}
