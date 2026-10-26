export type UnaryFunction<T, R> = (this: void, value: T) => R;

/**
 * 獨立函式版 `pipe`：把多個 operator 組合成一個新的 operator。它還沒有來源，之後再套用到 Observable。
 * 用途：把常用的 operator 組合包裝成可重複使用的自訂 operator。
 * ```ts
 * // 施法完成才送出；被打斷就不送出。多個技能共用。
 * const whenCastCompleted = (caster: unit, delay: number) => pipe(
 *   switchMap((e: SpellEvent) => timer(delay, { phase: Phase.Combat }).pipe(
 *     takeUntil(onSpellEndCast.of(caster)),
 *     map(() => e),
 *   )),
 * );
 *
 * onSpellChannel.of(hero).pipe(
 *   filter(e => e.abilityId === FIREBALL),
 *   whenCastCompleted(hero, 0.8),
 * ).subscribe(castFireball);
 * ```
 * 方法版 `observable.pipe(...)`（`./observable.ts`）不同：它已經有來源，並立即傳回套用後的 Observable。
 *
 * 多個重載的原因與方法版相同。迴圈與方法版重複；方法版不呼叫本函式，以避免每次多建立一個閉包。
 */
export function pipe<T>(): UnaryFunction<T, T>;
export function pipe<A, B>(ab: UnaryFunction<A, B>): UnaryFunction<A, B>;
export function pipe<A, B, C>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
): UnaryFunction<A, C>;
export function pipe<A, B, C, D>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
): UnaryFunction<A, D>;
export function pipe<A, B, C, D, E>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
    de: UnaryFunction<D, E>,
): UnaryFunction<A, E>;
export function pipe<A, B, C, D, E, F>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
    de: UnaryFunction<D, E>,
    ef: UnaryFunction<E, F>,
): UnaryFunction<A, F>;
export function pipe<A, B, C, D, E, F, G>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
    de: UnaryFunction<D, E>,
    ef: UnaryFunction<E, F>,
    fg: UnaryFunction<F, G>,
): UnaryFunction<A, G>;
export function pipe<A, B, C, D, E, F, G, H>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
    de: UnaryFunction<D, E>,
    ef: UnaryFunction<E, F>,
    fg: UnaryFunction<F, G>,
    gh: UnaryFunction<G, H>,
): UnaryFunction<A, H>;
export function pipe<A, B, C, D, E, F, G, H, I>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
    de: UnaryFunction<D, E>,
    ef: UnaryFunction<E, F>,
    fg: UnaryFunction<F, G>,
    gh: UnaryFunction<G, H>,
    hi: UnaryFunction<H, I>,
): UnaryFunction<A, I>;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
    ab: UnaryFunction<A, B>,
    bc: UnaryFunction<B, C>,
    cd: UnaryFunction<C, D>,
    de: UnaryFunction<D, E>,
    ef: UnaryFunction<E, F>,
    fg: UnaryFunction<F, G>,
    gh: UnaryFunction<G, H>,
    hi: UnaryFunction<H, I>,
    ij: UnaryFunction<I, J>,
): UnaryFunction<A, J>;
export function pipe(...operations: UnaryFunction<any, any>[]): UnaryFunction<any, any> {
    return (input) => {
        let result = input;
        for (const operation of operations) {
            result = operation(result);
        }
        return result;
    };
}
