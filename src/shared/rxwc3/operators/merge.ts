import { deriveObservable, Observable } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { Local, Sync, SyncKind } from "../sync/types";

type ValueOf<S> = S extends Observable<infer T, any> ? T : never;
type KindOf<S> = S extends Observable<any, infer K> ? K : never;
type MergedKind<S> = Local extends KindOf<S> ? Local : Sync;

export function merge<S extends readonly Observable<any, SyncKind>[]>(...sources: S): Observable<ValueOf<S[number]>, MergedKind<S[number]>> {
  return deriveObservable(sources, subscriber => {
    let remaining = sources.length;
    if (remaining === 0) {
      subscriber.complete();
    }
    for (const source of sources) {
      if (subscriber.closed) {
        break;
      }
      source.subscribe(operatorSubscriber(subscriber, value => subscriber.next(value), () => {
        if (--remaining === 0) {
          subscriber.complete();
        }
      }));
    }
  });
}
