import { Observable, OperatorFunction } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";

/**
 * 用 `project` 把每個值轉換成新的值。
 *
 * - `project`：沿用 rxjs 的名稱，意思是「投影」，也就是把一個值對應到另一個值。
 * - `index`：與 `Array.prototype.map` 相同，表示這是第幾個值（從 0 開始）。不需要時可以省略此參數。
 * - `index` 宣告在 `new Observable(...)` 內，所以每次訂閱都從 0 開始，不同訂閱不共用計數（冷串流語意）。
 *   不得把 `index` 移到外層，否則第二個訂閱者會延續第一個訂閱者的計數。
 * - `this: void`：使 TSTL 不在 Lua 中多傳一個 `self` 參數。`noImplicitSelf` 只影響專案內宣告的函式；
 *   寫在公開 API 的型別上，傳入其他函式庫的函式或物件方法時，錯誤會在編譯時出現，而不是在 Lua 執行時。
 * - `project` 拋出錯誤時，`operatorSubscriber` 把它轉為下游的 `error`，串流結束並清理。
 */
export function map<T, R>(project: (this: void, value: T, index: number) => R): OperatorFunction<T, R> {
  /**
   * 這一段等同於 return function(source) { return new Observable(...) }，但使用箭頭函式可以保留 this。
   * 這裡的 source 是上游的 Observable，subscriber 是下游的 Subscriber。
   * operatorSubscriber 會建立一個 Subscriber，並訂閱上游的 source。
   * 當上游發出 next 時，會呼叫 project 將值轉換後，送給下游的 subscriber。
   * 當上游發出 complete 或 error 時，也會轉送給下游。
   * 如果 project 拋出錯誤，會送給下游的 error，並結束串流。
   * 下游取消訂閱時，上游也會立即取消訂閱。
   * 
   * ```
   * 上游 source ──► operatorSubscriber ──► destination（下游）
   * ```
   */
  return source => new Observable(subscriber => {
    let index = 0;
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      subscriber.next(project(value, index++));
    }));
  });
}
