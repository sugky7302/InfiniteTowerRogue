import { Observable, OperatorFunction } from "../core/Observable";

export function finalize<T>(callback: (this: void) => void): OperatorFunction<T, T> {
  return source => new Observable(subscriber => {
    try {
      source.subscribe(subscriber);
    } finally {
      subscriber.add(callback);
    }
  });
}
