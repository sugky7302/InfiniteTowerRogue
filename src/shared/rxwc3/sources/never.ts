import { Observable } from "../core/Observable";

export function never<T = never>(): Observable<T> {
  return new Observable<T>();
}
