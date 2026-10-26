import { Observable } from "../core/observable";
import { TimeOptions, worldClock } from "../scheduler/clocks";
import { addTicks, durationTicks } from "../scheduler/time";

export function interval(periodSeconds: number, options: TimeOptions = {}): Observable<number> {
  return new Observable(subscriber => {
    const period = durationTicks(periodSeconds);
    if (period < 1) throw new Error("四捨五入後的週期必須至少為一毫秒。");
    const clock = options.clock ?? worldClock;
    let due = clock.nowTicks();
    let index = 0;
    const scheduleNext = () => {
      if (!subscriber.closed) {
        try {
          due = addTicks(due, period);
          subscriber.add(clock.scheduleAtTicks(due, () => {
            subscriber.next(index++);
            scheduleNext();
          }, options.phase));
        } catch (error) {
          subscriber.error(error);
        }
      }
    };
    scheduleNext();
  });
}
