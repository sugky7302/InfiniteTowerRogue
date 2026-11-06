import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber, PartialObserver } from "../core/subscriber";

export function tap<T>(
    observer: PartialObserver<T> | ((this: void, value: T) => void),
): OperatorFunction<T, T> {
    const callbacks = typeof observer === "function" ? { next: observer } : observer;
    return (source) =>
        deriveObservable(source, (subscriber) => {
            source.subscribe(
                operatorSubscriber<T>(
                    subscriber,
                    (value) => {
                        if (callbacks.next !== undefined) {
                            callbacks.next(value);
                        }
                        subscriber.next(value);
                    },
                    () => {
                        if (callbacks.complete !== undefined) {
                            callbacks.complete();
                        }
                        subscriber.complete();
                    },
                    (error) => {
                        if (callbacks.error !== undefined) {
                            callbacks.error(error);
                        }
                        subscriber.error(error);
                    },
                ),
            );
        });
}
