import {
    checkInnerSync,
    deriveObservable,
    FlattenOperatorFunction,
    Observable,
} from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { SyncKind } from "../sync/types";

/** 內層可能是本地時，請在建立時傳入 innerSyncKind 為 local。 */
export function mergeMap<T, R, I extends SyncKind>(
    project: (this: void, value: T, index: number) => Observable<R, I>,
    innerSyncKind: I = "sync" as I,
): FlattenOperatorFunction<T, R, I> {
    return (source) =>
        deriveObservable(
            source,
            (subscriber) => {
                let active = 0;
                let outerComplete = false;
                let index = 0;
                const checkComplete = () => {
                    if (outerComplete && active === 0) {
                        subscriber.complete();
                    }
                };
                source.subscribe(
                    operatorSubscriber<T>(
                        subscriber,
                        (value) => {
                            active++;
                            const inner = project(value, index++);
                            checkInnerSync(source, inner, innerSyncKind);
                            inner.subscribe(
                                operatorSubscriber<R>(
                                    subscriber,
                                    (item) => subscriber.next(item),
                                    () => {
                                        active--;
                                        checkComplete();
                                    },
                                ),
                            );
                        },
                        () => {
                            outerComplete = true;
                            checkComplete();
                        },
                    ),
                );
            },
            innerSyncKind,
        );
}
