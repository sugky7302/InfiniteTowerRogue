import { Sync, SyncKind } from "../sync/types";
import { Observable } from "./Observable";
import { Subscriber } from "./Subscriber";
import { TeardownLogic } from "./Subscription";
import { reportUnhandledError } from "./config";

export class Subject<T, K extends SyncKind = Sync> extends Observable<T, K> {
  protected stopped = false;
  protected hasError = false;
  protected terminalError: unknown;
  private subscribers: Subscriber<T>[] = [];
  private dispatchDepth = 0;

  protected subscribeActual(subscriber: Subscriber<T>): TeardownLogic {
    if (this.hasError) {
      subscriber.error(this.terminalError);
    } else if (this.stopped) {
      subscriber.complete();
    } else {
      this.subscribers.push(subscriber);
      return () => {
        if (this.dispatchDepth === 0) {
          this.compact();
        }
      };
    }
  }

  public next(value: T): void {
    if (!this.stopped) {
      this.dispatch(subscriber => subscriber.next(value));
    }
  }

  public error(error: unknown): void {
    if (!this.stopped) {
      this.stopped = true;
      this.hasError = true;
      this.terminalError = error;
      this.dispatch(subscriber => subscriber.error(error));
    }
  }

  public complete(): void {
    if (!this.stopped) {
      this.stopped = true;
      this.dispatch(subscriber => subscriber.complete());
    }
  }

  public asObservable(): Observable<T, K> {
    return new Observable<T, K>(subscriber => this.subscribe(subscriber));
  }

  private dispatch(notify: (this: void, subscriber: Subscriber<T>) => void): void {
    const length = this.subscribers.length;
    this.dispatchDepth++;
    try {
      for (let index = 0; index < length; index++) {
        const subscriber = this.subscribers[index];
        if (!subscriber.closed) {
          try {
            notify(subscriber);
          } catch (error) {
            reportUnhandledError(error);
          }
        }
      }
    } finally {
      this.dispatchDepth--;
      if (this.dispatchDepth === 0) {
        this.compact();
      }
    }
  }

  private compact(): void {
    let count = 0;
    for (let index = 0; index < this.subscribers.length; index++) {
      const subscriber = this.subscribers[index];
      if (!subscriber.closed) {
        this.subscribers[count++] = subscriber;
      }
    }
    this.subscribers.length = count;
  }
}
