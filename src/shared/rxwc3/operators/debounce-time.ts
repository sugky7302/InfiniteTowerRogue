import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { TimeOptions, worldClock } from "../scheduler/clocks";
import { ScheduledTask } from "../scheduler/scheduler";
import { durationTicks } from "../scheduler/time";

export function debounceTime<T>(seconds: number, options: TimeOptions = {}): OperatorFunction<T, T> {
  return source => deriveObservable(source, subscriber => {
    const duration = durationTicks(seconds);
    const clock = options.clock ?? worldClock;
    let task: ScheduledTask | undefined;
    let pending = false;
    let last: T;
    const emit = () => {
      if (task !== undefined) task.unsubscribe();
      task = undefined;
      if (pending) {
        const value = last;
        pending = false;
        last = undefined as T;
        subscriber.next(value);
      }
    };
    subscriber.add(() => { last = undefined as T; pending = false; task = undefined; });
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (task !== undefined) task.unsubscribe();
      last = value;
      pending = true;
      task = clock.scheduleTicks(duration, emit, options.phase);
      subscriber.add(task);
    }, () => {
      emit();
      subscriber.complete();
    }));
  });
}
