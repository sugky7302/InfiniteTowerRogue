import { Observable } from "../core/observable";
import { from } from "./from";

export function of<T>(...values: T[]): Observable<T> {
  return from(values);
}
