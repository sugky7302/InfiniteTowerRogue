import { Observable } from "../core/observable";
import { SyncKind } from "../sync/types";

export function from<T, K extends SyncKind>(input: Observable<T, K>): Observable<T, K>;
export function from<T>(input: readonly T[]): Observable<T>;
export function from<T, K extends SyncKind>(input: Observable<T, K> | readonly T[]): Observable<T, K> | Observable<T> {
  if (input instanceof Observable) {
    return input;
  }
  return new Observable<T>(subscriber => {
    for (let index = 0; index < input.length && !subscriber.closed; index++) {
      subscriber.next(input[index]);
    }
    if (!subscriber.closed) {
      subscriber.complete();
    }
  });
}
