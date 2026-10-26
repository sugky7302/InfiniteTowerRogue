import { deriveObservable, Observable, OperatorFunction } from "../core/observable";

export function finalize<T>(callback: (this: void) => void): OperatorFunction<T, T> {
  return source => deriveObservable(source, subscriber => {
    try {
      source.subscribe(subscriber);
    } finally {
      subscriber.add(callback);
    }
  });
}
