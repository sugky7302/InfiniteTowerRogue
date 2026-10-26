import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { TimeOptions, worldClock } from "../scheduler/clocks";
import { ScheduledTask } from "../scheduler/scheduler";
import { durationTicks } from "../scheduler/time";

export interface ThrottleTimeOptions extends TimeOptions {
  leading?: boolean;
  trailing?: boolean;
}

export function throttleTime<T>(seconds: number, options: ThrottleTimeOptions = {}): OperatorFunction<T, T> {
  return source => deriveObservable(source, subscriber => {
    const duration = durationTicks(seconds);
    const clock = options.clock ?? worldClock;
    const leading = options.leading ?? true;
    const trailing = options.trailing ?? false;
    let task: ScheduledTask | undefined;
    let pending = false;
    let last: T;
    let completed = false;
    const startWindow = () => {
      task = clock.scheduleTicks(duration, () => {
        task = undefined;
        if (trailing && pending) {
          const value = last;
          pending = false;
          last = undefined as T;
          // 先建立下一個視窗，讓回呼中的來源重入受到相同限制。
          if (!completed) startWindow();
          subscriber.next(value);
        }
        if (completed) subscriber.complete();
      }, options.phase);
      subscriber.add(task);
    };
    subscriber.add(() => { last = undefined as T; pending = false; task = undefined; });
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (task !== undefined) {
        if (trailing) { last = value; pending = true; }
        return;
      }
      if (!leading && trailing) { last = value; pending = true; }
      startWindow();
      if (leading) subscriber.next(value);
    }, () => {
      completed = true;
      if (!trailing || !pending || task === undefined) subscriber.complete();
    }));
  });
}
