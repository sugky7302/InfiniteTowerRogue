import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { TimeOptions, worldClock } from "../scheduler/clocks";
import { durationTicks } from "../scheduler/time";

export function delay<T>(seconds: number, options: TimeOptions = {}): OperatorFunction<T, T> {
  return source => deriveObservable(source, subscriber => {
    const duration = durationTicks(seconds);
    const clock = options.clock ?? worldClock;
    let pending = 0;
    let completed = false;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      pending++;
      subscriber.add(clock.scheduleTicks(duration, () => {
        pending--;
        subscriber.next(value);
        if (completed && pending === 0) subscriber.complete();
      }, options.phase));
    }, () => {
      completed = true;
      if (pending === 0) subscriber.complete();
    }));
  });
}
