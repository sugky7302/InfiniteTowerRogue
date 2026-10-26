import { Observable } from "../core/Observable";

export function empty<T = never>(): Observable<T> {
  return new Observable<T>(subscriber => subscriber.complete());
}
