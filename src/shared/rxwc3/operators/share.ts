import { deriveObservable, Observable, OperatorFunction } from "../core/observable";
import { Subscriber } from "../core/subscriber";
import { Subject } from "../core/subject";
import { SyncKind } from "../sync/types";

interface SharedState<T, K extends SyncKind> {
    subject: Subject<T, K>;
    connection: Subscriber<T>;
    references: number;
    started: boolean;
}

export function share<T>(): OperatorFunction<T, T> {
    return <K extends SyncKind>(source: Observable<T, K>) => {
        let state: SharedState<T, K> | undefined;
        return deriveObservable<T, K>(source, (subscriber) => {
            if (state === undefined) {
                const subject = new Subject<T, K>();
                const connection = new Subscriber<T>({
                    next: (value) => subject.next(value),
                    error: (error) => {
                        if (state !== undefined && state.subject === subject) {
                            state = undefined;
                        }
                        subject.error(error);
                    },
                    complete: () => {
                        if (state !== undefined && state.subject === subject) {
                            state = undefined;
                        }
                        subject.complete();
                    },
                });
                state = { subject, connection, references: 0, started: false };
            }
            const current = state;
            current.references++;
            subscriber.add(() => {
                if (--current.references === 0) {
                    if (state === current) {
                        state = undefined;
                    }
                    current.connection.unsubscribe();
                }
            });
            current.subject.subscribe(subscriber);
            if (!current.started && !subscriber.closed) {
                current.started = true;
                source.subscribe(current.connection);
            }
        });
    };
}
