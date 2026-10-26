import { Observable } from "../core/Observable";
import { from } from "./from";

export function of<T>(...values: T[]): Observable<T> {
  return from(values);
}
