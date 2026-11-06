import { reportUnhandledError } from "./config";
import { Subscription, TeardownLogic } from "./subscription";
import { isLocalExecution, runLocal, setLocalExecution } from "../sync/execution";
import { protectedCall } from "./protected-call";

export interface Observer<T> {
    next: (this: void, value: T) => void;
    error: (this: void, error: unknown) => void;
    complete: (this: void) => void;
}

export type PartialObserver<T> = Partial<Observer<T>>;

export class Subscriber<T> extends Subscription {
    /** 本地串流的回呼不能建立同步觸發器。 */
    public localContext = false;
    private stopped = false;

    public constructor(private readonly observer: PartialObserver<T> = {}) {
        super();
    }

    public add(teardown: TeardownLogic): void {
        // 同步完成後才加入的清理也屬於原本的本地回呼。
        if (this.closed && this.localContext) runLocal(() => super.add(teardown));
        else super.add(teardown);
    }

    public next(value: T): void {
        if (!this.closed && !this.stopped && this.observer.next !== undefined) {
            if (this.localContext) this.notify(this.observer.next, value);
            else {
                const [ok, error] = protectedCall(this.observer.next, value);
                if (!ok) reportUnhandledError(error);
            }
        }
    }

    public error(error: unknown): void {
        if (this.closed || this.stopped) {
            return;
        }
        this.stopped = true;
        if (this.observer.error !== undefined) this.notify(this.observer.error, error);
        else reportUnhandledError(error);
        this.unsubscribe();
    }

    public complete(): void {
        if (this.closed || this.stopped) {
            return;
        }
        this.stopped = true;
        if (this.observer.complete !== undefined)
            this.notify(this.observer.complete, undefined, true);
        this.unsubscribe();
    }

    private notify(callback: (this: void, value: any) => void, value: any, noValue = false): void {
        const previous = isLocalExecution();
        if (this.localContext) setLocalExecution(true);
        let ok: boolean;
        let error: unknown;
        if (noValue) [ok, error] = protectedCall(callback);
        else [ok, error] = protectedCall(callback, value);
        setLocalExecution(previous);
        if (!ok) reportUnhandledError(error);
    }

    public unsubscribe(): void {
        this.stopped = true;
        if (this.localContext) runLocal(() => super.unsubscribe());
        else super.unsubscribe();
    }
}

function callNext(this: void, subscriber: Subscriber<any>, value: any): void {
    subscriber.next(value);
}

function callError(this: void, subscriber: Subscriber<any>, error: unknown): void {
    subscriber.error(error);
}

function callComplete(this: void, subscriber: Subscriber<any>): void {
    subscriber.complete();
}

/** 一般方法已有保護。自訂方法須由分發端隔離錯誤。 */
export function notifyNext(this: void, subscriber: Subscriber<any>, value: any): void {
    if (subscriber.next === Subscriber.prototype.next) subscriber.next(value);
    else {
        const [ok, error] = protectedCall(callNext, subscriber, value);
        if (!ok) reportUnhandledError(error);
    }
}

export function notifyError(this: void, subscriber: Subscriber<any>, error: unknown): void {
    if (
        subscriber.error === Subscriber.prototype.error &&
        subscriber.unsubscribe === Subscriber.prototype.unsubscribe
    )
        subscriber.error(error);
    else {
        const [ok, caught] = protectedCall(callError, subscriber, error);
        if (!ok) reportUnhandledError(caught);
    }
}

export function notifyComplete(this: void, subscriber: Subscriber<any>): void {
    if (
        subscriber.complete === Subscriber.prototype.complete &&
        subscriber.unsubscribe === Subscriber.prototype.unsubscribe
    )
        subscriber.complete();
    else {
        const [ok, error] = protectedCall(callComplete, subscriber);
        if (!ok) reportUnhandledError(error);
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
        next: (value) => {
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
        error: (caught) => {
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
