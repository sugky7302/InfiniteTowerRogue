import { reportUnhandledError } from "./config";
import { Subscription } from "./subscription";

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

/**
 * 建立 operator 用來訂閱上游的 Subscriber。相當於 rxjs 內部的 `createOperatorSubscriber`。
 *
 * ```
 * 上游 source ──► operatorSubscriber ──► destination（下游）
 * ```
 *
 * 它處理三件事：
 * 1. 預設轉送：`next` 必須傳入。省略 `complete` 或 `error` 時，直接轉送給下游。
 * 2. 例外轉為串流錯誤：operator 回呼（例如 `map` 的 `project`）拋出錯誤時，送出下游的 `error`，串流結束並清理。
 *    一般 `Subscriber` 不同：最終訂閱者的回呼出錯時，只回報 `reportUnhandledError`，串流繼續。
 *    原因：operator 的錯誤屬於資料流，下游可以處理；使用者回呼的錯誤不應影響其他訂閱者。
 * 3. 先連接取消關係：`destination.add(subscriber)` 在 `source.subscribe(...)` 之前執行。下游取消時，上游立即關閉。
 *    例如 `of(1, 2, 3).pipe(map(...), take(1))`：`take(1)` 收到 1 後取消，2 與 3 不再經過 `map`。
 *    在 WC3 中，`takeUntil` 中斷倒數時，上游的計時器在同一時刻釋放。
 */
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
