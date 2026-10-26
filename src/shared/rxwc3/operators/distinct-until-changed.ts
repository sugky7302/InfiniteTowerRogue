import { Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

export function distinctUntilChanged<T>(equals: (this: void, previous: T, current: T) => boolean = (previous, current) => previous === current): OperatorFunction<T, T> {
  return source => new Observable(subscriber => {
    let hasPrevious = false;
    let previous: T;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (!hasPrevious || !equals(previous, value)) {
        hasPrevious = true;
        previous = value;
        subscriber.next(value);
      }
    }));
  });
}
