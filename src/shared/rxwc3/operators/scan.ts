import { Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

export function scan<T, R>(accumulate: (this: void, state: R, value: T, index: number) => R, seed: R): OperatorFunction<T, R> {
  return source => new Observable(subscriber => {
    let state = seed;
    let index = 0;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      state = accumulate(state, value, index++);
      subscriber.next(state);
    }));
  });
}
