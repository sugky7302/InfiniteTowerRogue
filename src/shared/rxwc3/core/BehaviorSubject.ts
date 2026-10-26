import { Sync, SyncKind } from "../sync/types";
import { Subject } from "./Subject";
import { Subscriber } from "./Subscriber";
import { TeardownLogic } from "./Subscription";

export class BehaviorSubject<T, K extends SyncKind = Sync> extends Subject<T, K> {
  public constructor(private currentValue: T) {
    super();
  }

  protected subscribeActual(subscriber: Subscriber<T>): TeardownLogic {
    const teardown = super.subscribeActual(subscriber);
    if (!subscriber.closed) {
      subscriber.next(this.currentValue);
    }
    return teardown;
  }

  public getValue(): T {
    if (this.hasError) {
      throw this.terminalError;
    }
    return this.currentValue;
  }

  public next(value: T): void {
    if (!this.stopped) {
      this.currentValue = value;
      super.next(value);
    }
  }
}
