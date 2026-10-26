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

/** 共用標記規則。一般 operator 只提供來源與訂閱流程。 */
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

/** 未預先宣告的本地內層不能進入同步輸出。 */
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
