export type UnaryFunction<T, R> = (this: void, value: T) => R;

export function pipe<T>(): UnaryFunction<T, T>;
export function pipe<A, B>(ab: UnaryFunction<A, B>): UnaryFunction<A, B>;
export function pipe<A, B, C>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>): UnaryFunction<A, C>;
export function pipe<A, B, C, D>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>): UnaryFunction<A, D>;
export function pipe<A, B, C, D, E>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>, de: UnaryFunction<D, E>): UnaryFunction<A, E>;
export function pipe<A, B, C, D, E, F>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>, de: UnaryFunction<D, E>, ef: UnaryFunction<E, F>): UnaryFunction<A, F>;
export function pipe<A, B, C, D, E, F, G>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>, de: UnaryFunction<D, E>, ef: UnaryFunction<E, F>, fg: UnaryFunction<F, G>): UnaryFunction<A, G>;
export function pipe<A, B, C, D, E, F, G, H>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>, de: UnaryFunction<D, E>, ef: UnaryFunction<E, F>, fg: UnaryFunction<F, G>, gh: UnaryFunction<G, H>): UnaryFunction<A, H>;
export function pipe<A, B, C, D, E, F, G, H, I>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>, de: UnaryFunction<D, E>, ef: UnaryFunction<E, F>, fg: UnaryFunction<F, G>, gh: UnaryFunction<G, H>, hi: UnaryFunction<H, I>): UnaryFunction<A, I>;
export function pipe<A, B, C, D, E, F, G, H, I, J>(ab: UnaryFunction<A, B>, bc: UnaryFunction<B, C>, cd: UnaryFunction<C, D>, de: UnaryFunction<D, E>, ef: UnaryFunction<E, F>, fg: UnaryFunction<F, G>, gh: UnaryFunction<G, H>, hi: UnaryFunction<H, I>, ij: UnaryFunction<I, J>): UnaryFunction<A, J>;
export function pipe(...operations: UnaryFunction<any, any>[]): UnaryFunction<any, any> {
  return input => {
    let result = input;
    for (const operation of operations) {
      result = operation(result);
    }
    return result;
  };
}
