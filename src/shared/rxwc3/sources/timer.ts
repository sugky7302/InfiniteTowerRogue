import { Observable } from "../core/observable";
import { TimeOptions, worldClock } from "../scheduler/clocks";

export function timer(dueSeconds: number, options: TimeOptions = {}): Observable<number> {
  return new Observable(subscriber => (options.clock ?? worldClock).schedule(dueSeconds, () => {
    subscriber.next(0);
    subscriber.complete();
  }, options.phase));
}
