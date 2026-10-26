import { Observable, OperatorFunction } from "../core/Observable";
import { operatorSubscriber } from "../core/Subscriber";

export function map<T, R>(project: (this: void, value: T, index: number) => R): OperatorFunction<T, R> {
  return source => new Observable(subscriber => {
    let index = 0;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      subscriber.next(project(value, index++));
    }));
  });
}
