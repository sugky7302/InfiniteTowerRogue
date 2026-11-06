import { CombinedKind, Local, Sync, SyncKind } from "../sync/types";
import { PartialObserver, Subscriber } from "./subscriber";
import { TeardownLogic } from "./subscription";
import { UnaryFunction } from "./pipe";

export type OperatorFunction<T, R> = <K extends SyncKind>(
    this: void,
    source: Observable<T, K>,
) => Observable<R, K>;
export type FlattenOperatorFunction<T, R, I extends SyncKind> = <K extends SyncKind>(
    this: void,
    source: Observable<T, K>,
) => Observable<R, CombinedKind<K, I>>;
export type LocalObservable<T> = Observable<T, Local>;

export class Observable<T, K extends SyncKind = Sync> {
    declare protected readonly syncKind: K;

    public constructor(
        private readonly initializer?: (this: void, subscriber: Subscriber<T>) => TeardownLogic,
        public readonly runtimeSyncKind: SyncKind = "sync",
    ) {}

    public subscribe(
        observer?: PartialObserver<T> | ((this: void, value: T) => void) | Subscriber<T>,
        error?: (this: void, error: unknown) => void,
        complete?: (this: void) => void,
    ): Subscriber<T> {
        const subscriber =
            observer instanceof Subscriber
                ? observer
                : new Subscriber<T>(
                      typeof observer === "function"
                          ? { next: observer, error, complete }
                          : observer,
                  );
        if (!subscriber.closed) {
            subscriber.localContext = subscriber.localContext || this.runtimeSyncKind === "local";
            try {
                subscriber.add(this.subscribeActual(subscriber));
            } catch (caught) {
                subscriber.error(caught);
            }
        }
        return subscriber;
    }

    protected subscribeActual(subscriber: Subscriber<T>): TeardownLogic {
        if (this.initializer !== undefined) {
            return this.initializer(subscriber);
        }
    }

    /**
     * 方法版 `pipe`：把 operator 依序套用到這個 Observable，並立即傳回結果。平常組合串流時使用。
     * ```ts
     * onSpellChannel.of(caster).pipe(filter(...), switchMap(...)).subscribe(...);
     * ```
     * 獨立函式版 `pipe`（`./pipe.ts`）不同：它還沒有來源，傳回的是一個新的 operator。
     *
     * 多個重載：TS 無法用一個簽名表示「每一步的輸出是下一步的輸入」，所以列出 0 至 9 個參數的情況。
     * 最後一個沒有型別限制的簽名才是實作。
     */
    public pipe(): Observable<T, K>;
    public pipe<A>(a: UnaryFunction<Observable<T, K>, A>): A;
    public pipe<A, B>(a: UnaryFunction<Observable<T, K>, A>, b: UnaryFunction<A, B>): B;
    public pipe<A, B, C>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
    ): C;
    public pipe<A, B, C, D>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
        d: UnaryFunction<C, D>,
    ): D;
    public pipe<A, B, C, D, E>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
        d: UnaryFunction<C, D>,
        e: UnaryFunction<D, E>,
    ): E;
    public pipe<A, B, C, D, E, F>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
        d: UnaryFunction<C, D>,
        e: UnaryFunction<D, E>,
        f: UnaryFunction<E, F>,
    ): F;
    public pipe<A, B, C, D, E, F, G>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
        d: UnaryFunction<C, D>,
        e: UnaryFunction<D, E>,
        f: UnaryFunction<E, F>,
        g: UnaryFunction<F, G>,
    ): G;
    public pipe<A, B, C, D, E, F, G, H>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
        d: UnaryFunction<C, D>,
        e: UnaryFunction<D, E>,
        f: UnaryFunction<E, F>,
        g: UnaryFunction<F, G>,
        h: UnaryFunction<G, H>,
    ): H;
    public pipe<A, B, C, D, E, F, G, H, I>(
        a: UnaryFunction<Observable<T, K>, A>,
        b: UnaryFunction<A, B>,
        c: UnaryFunction<B, C>,
        d: UnaryFunction<C, D>,
        e: UnaryFunction<D, E>,
        f: UnaryFunction<E, F>,
        g: UnaryFunction<F, G>,
        h: UnaryFunction<G, H>,
        i: UnaryFunction<H, I>,
    ): I;
    public pipe(...operations: UnaryFunction<any, any>[]): any {
        let result: any = this;
        for (const operation of operations) {
            result = operation(result);
        }
        return result;
    }
}

/**
 * 建立新的 Observable，並自動繼承來源的同步或本地標記（M4 的執行時本地標記）。
 *
 * 背景：型別參數 `K`（`Sync`／`Local`）只存在於 TypeScript，轉譯為 Lua 後消失。
 * 所以 Observable 另有欄位 `runtimeSyncKind`，讓執行時也知道串流的同步性（`toSignal` 與 Signal 檢查會讀取）。
 *
 * 問題：operator 會建立新的 Observable。直接使用 `new Observable(...)` 時，`runtimeSyncKind` 預設為 `"sync"`，
 * 本地串流經過 `map` 等 operator 後，標記會變回同步，執行時檢查因此失效。
 * ```ts
 * return (source) => deriveObservable(source, (subscriber) => { ... }); // operator 請使用此寫法
 * ```
 *
 * 參數：
 * - `sources`：上游 Observable，一個或陣列。
 * - `initializer`：與 `new Observable(...)` 的參數相同，訂閱時執行。
 * - `extraKind`：額外指定的同步性，預設 `"sync"`。
 *
 * 規則：任一來源為本地，或 `extraKind` 為 `"local"` 時，結果為本地；否則為同步。
 * - `map`、`filter` 等：一個來源，結果與來源相同。
 * - `merge(a$, b$)`：任一來源為本地，結果為本地。
 * - `mergeMap(fn, "local")`：內層在執行時才產生，建立時無法得知其同步性，所以由使用者宣告。
 *   未宣告卻收到本地內層時，`checkInnerSync` 拋出錯誤。
 *
 * 統一使用此函式，規則只寫一次，避免各 operator 重複實作或漏寫。
 */
export function deriveObservable<T, K extends SyncKind>(
    sources: Observable<any, any> | readonly Observable<any, any>[],
    initializer: (this: void, subscriber: Subscriber<T>) => TeardownLogic,
    extraKind: SyncKind = "sync",
): Observable<T, K> {
    let kind = extraKind;
    if (sources instanceof Observable) {
        if (sources.runtimeSyncKind === "local") kind = "local";
    } else {
        for (const source of sources) {
            if (source.runtimeSyncKind === "local") kind = "local";
        }
    }
    return new Observable<T, K>(initializer, kind);
}

/**
 * 給 `mergeMap`／`switchMap` 使用：來源為同步、建立時沒有宣告內層為本地，實際內層卻是本地時，拋出錯誤。
 * 原因：此時輸出串流已標記為同步，本地值不得進入同步輸出。
 */
export function checkInnerSync(
    source: Observable<any, any>,
    inner: Observable<any, any>,
    declared: SyncKind,
): void {
    if (
        source.runtimeSyncKind !== "local" &&
        declared !== "local" &&
        inner.runtimeSyncKind === "local"
    ) {
        throw new Error("本地內層必須在建立 operator 時指定 innerSyncKind 為 local。");
    }
}
