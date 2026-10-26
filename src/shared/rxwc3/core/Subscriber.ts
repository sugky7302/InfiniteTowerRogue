import { reportUnhandledError } from "./config";
import { Subscription } from "./Subscription";

export interface Observer<T> {
  next: (this: void, value: T) => void;
  error: (this: void, error: unknown) => void;
  complete: (this: void) => void;
}

export type PartialObserver<T> = Partial<Observer<T>>;

export class Subscriber<T> extends Subscription {
  private stopped = false;

  public constructor(private readonly observer: PartialObserver<T> = {}) {
    super();
  }

  public next(value: T): void {
    if (!this.closed && !this.stopped && this.observer.next !== undefined) {
      try {
        this.observer.next(value);
      } catch (error) {
        reportUnhandledError(error);
      }
    }
  }

  public error(error: unknown): void {
    if (this.closed || this.stopped) {
      return;
    }
    this.stopped = true;
    try {
      if (this.observer.error !== undefined) {
        this.observer.error(error);
      } else {
        reportUnhandledError(error);
      }
    } catch (handlerError) {
      reportUnhandledError(handlerError);
    } finally {
      this.unsubscribe();
    }
  }

  public complete(): void {
    if (this.closed || this.stopped) {
      return;
    }
    this.stopped = true;
    try {
      if (this.observer.complete !== undefined) {
        this.observer.complete();
      }
    } catch (error) {
      reportUnhandledError(error);
    } finally {
      this.unsubscribe();
    }
  }

  public unsubscribe(): void {
    this.stopped = true;
    super.unsubscribe();
  }
}

// 先連接取消關係，讓同步來源可以立即停止。
export function operatorSubscriber<T>(
  destination: Subscriber<any>,
  next: (this: void, value: T) => void,
  complete?: (this: void) => void,
  error?: (this: void, error: unknown) => void,
): Subscriber<T> {
  const subscriber = new Subscriber<T>({
    next: value => {
      try {
        next(value);
      } catch (caught) {
        destination.error(caught);
      }
    },
    complete: () => {
      try {
        if (complete === undefined) {
          destination.complete();
        } else {
          complete();
        }
      } catch (caught) {
        destination.error(caught);
      }
    },
    error: caught => {
      if (error === undefined) {
        destination.error(caught);
      } else {
        try {
          error(caught);
        } catch (handlerError) {
          destination.error(handlerError);
        }
      }
    },
  });
  destination.add(subscriber);
  return subscriber;
}
