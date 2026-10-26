import { Sync, SyncKind } from "../sync/types";
import { deriveObservable, Observable } from "./observable";
import { Subscriber } from "./subscriber";
import { TeardownLogic } from "./subscription";
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
            this.dispatch((subscriber) => subscriber.next(value));
        }
    }

    public error(error: unknown): void {
        if (!this.stopped) {
            this.stopped = true;
            this.hasError = true;
            this.terminalError = error;
            this.dispatch((subscriber) => subscriber.error(error));
        }
    }

    public complete(): void {
        if (!this.stopped) {
            this.stopped = true;
            this.dispatch((subscriber) => subscriber.complete());
        }
    }

    public asObservable(): Observable<T, K> {
        return deriveObservable<T, K>(this, (subscriber) => this.subscribe(subscriber));
    }

    /**
     * 通知全部訂閱者的共用迴圈。`next`、`error`、`complete` 只差在「做什麼」，所以由 `notify` 傳入。
     * - 先記錄長度：只通知開始時已存在的訂閱者。通知中新加入者從下一次開始接收。
     * - 跳過已關閉者：通知中取消訂閱的訂閱者仍在陣列中，但不再收到通知。
     * - 隔離錯誤：一個訂閱者拋出錯誤時，其他訂閱者照常收到通知。
     * - `dispatchDepth`：訂閱者可能在回呼中再呼叫同一個 Subject 的 `next`（巢狀通知），所以使用計數。
     *   最外層通知結束時才 `compact()`。
     *
     * 通知中不得用 `splice` 刪除訂閱者：
     * ```
     * 通知中 index = 1（B）：[A, B, C, D]
     * B 取消並刪除 → [A, C, D]；index++ → 2，讀到 D，C 被跳過。
     * ```
     * rxjs 每次通知前複製陣列（`slice()`）。傷害事件頻率高，複製會增加 Lua GC 負擔，所以設計稿禁止複製。
     */
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

    /**
     * 就地移除已關閉的訂閱者（雙指標），不建立新陣列。
     * ```
     * [A, B(closed), C, D(closed), E] → [A, C, E]
     * ```
     * 呼叫時機：最外層通知結束後；或不在通知中時取消訂閱。
     * 注意：目前每次通知後都會走訪一次陣列，即使沒有人取消。`RouteSubject`（`wc3/event-hub.ts`）用 `dirty`
     * 旗標只在需要時清理；一般 Subject 確認為效能瓶頸後，可加入相同的優化。
     */
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
