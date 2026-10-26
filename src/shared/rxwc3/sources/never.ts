import { Observable } from "../core/observable";

export function never<T = never>(): Observable<T> {
  return new Observable<T>();
}
