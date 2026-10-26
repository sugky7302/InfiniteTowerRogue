import { Observable } from "../core/observable";

export function empty<T = never>(): Observable<T> {
  return new Observable<T>(subscriber => subscriber.complete());
}
