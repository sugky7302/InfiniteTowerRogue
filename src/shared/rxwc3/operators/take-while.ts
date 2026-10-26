import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

export function takeWhile<T>(
    predicate: (this: void, value: T, index: number) => boolean,
): OperatorFunction<T, T> {
    return (source) =>
        deriveObservable(source, (subscriber) => {
            let index = 0;
            source.subscribe(
                operatorSubscriber<T>(subscriber, (value) => {
                    if (predicate(value, index++)) {
                        subscriber.next(value);
                    } else {
                        subscriber.complete();
                    }
                }),
            );
        });
}
