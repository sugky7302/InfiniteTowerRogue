import { reportUnhandledError } from "./config";

/**
 * Teardown 是 Subscription 關閉時執行的清理邏輯。它是「關閉」這個動作的一部分。
 *
 * 執行時機：呼叫 `unsubscribe()` 時。以下三種情況都會呼叫它：
 * 1. 手動呼叫 `sub.unsubscribe()`。
 * 2. 來源送出 `complete`，Subscriber 自動關閉。
 * 3. 來源送出 `error`，Subscriber 自動關閉。
 * 每個 teardown 只執行一次。
 *
 * 兩種形式：
 * - 函式：關閉時呼叫它。
 * - 子 Subscription：關閉時呼叫它的 `unsubscribe()`。實體可以用一個 Subscription 收集全部訂閱。
 *
 * Teardown 不收到值，也不知道關閉原因（完成、錯誤或取消）。
 * 需要依原因處理時，使用 `subscribe` 的 `complete`/`error` 回呼，或使用 `tap`。
 *
 * WC3 用法：建立 Observable 時，subscribe 函式傳回的值就是 teardown，用來釋放 handle。
 * ```ts
 * const fromTimer = (sec: number) => new Observable<void>(subscriber => {
 *   const t = CreateTimer();
 *   TimerStart(t, sec, false, () => { subscriber.next(); subscriber.complete(); });
 *   return () => DestroyTimer(t); // teardown
 * });
 * ```
 * `takeUntil` 中斷倒數時，上游的 Subscription 關閉，並執行 `DestroyTimer`。
 */
export type Teardown = Subscription | ((this: void) => void);
export type TeardownLogic = Teardown | void;

export class Subscription {
    public closed = false;
    private teardowns: Teardown[] = [];
    private parents: Subscription[] = [];

    public constructor(teardown?: (this: void) => void) {
        if (teardown !== undefined) {
            this.add(teardown);
        }
    }

    /** 加入 teardown。如果 Subscription 已經關閉，立即執行它，以避免資源洩漏。 */
    public add(teardown: TeardownLogic): void {
        if (teardown === undefined || teardown === this) {
            return;
        }
        if (teardown instanceof Subscription && teardown.closed) {
            return;
        }
        if (this.closed) {
            this.runTeardown(teardown);
            // 如果 teardown 已經在 teardowns 中，避免重複加入，否則會重複執行。
        } else if (this.teardowns.indexOf(teardown) < 0) {
            this.teardowns.push(teardown);
            if (teardown instanceof Subscription) {
                teardown.parents.push(this);
            }
        }
    }

    public remove(teardown: Teardown): void {
        const index = this.teardowns.indexOf(teardown);
        if (index >= 0) {
            this.teardowns.splice(index, 1);
        }
        // 如果 teardown 是 Subscription，從它的 parents 中移除自己，避免記憶體洩漏。
        if (teardown instanceof Subscription) {
            const parentIndex = teardown.parents.indexOf(this);
            if (parentIndex >= 0) {
                teardown.parents.splice(parentIndex, 1);
            }
        }
    }

    /** 關閉 Subscription，執行所有 teardown。 */
    public unsubscribe(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        const parents = this.parents;
        this.parents = [];
        for (const parent of parents) {
            parent.remove(this);
        }
        const teardowns = this.teardowns;
        this.teardowns = [];
        for (const teardown of teardowns) {
            this.runTeardown(teardown);
        }
    }

    /** 一個 teardown 拋出錯誤時，報告錯誤，其他 teardown 繼續執行。 */
    private runTeardown(teardown: Teardown): void {
        try {
            if (typeof teardown === "function") {
                teardown();
            } else {
                teardown.unsubscribe();
            }
        } catch (error) {
            reportUnhandledError(error);
        }
    }
}
