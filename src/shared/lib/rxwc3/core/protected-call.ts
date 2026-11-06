/** 保留 Lua 的多重回傳。Node 不載入 Lua 全域型別。 */
type CallResult = [boolean, any] & { readonly __tstlMultiReturn: unknown };
type Callback = (this: void, ...args: any[]) => any;

declare function pcall(this: void, fn: Callback, ...args: any[]): CallResult;

function nodeCall(this: void, fn: Callback, ...args: any[]): CallResult {
    try {
        return [true, fn(...args)] as CallResult;
    } catch (error) {
        return [false, error] as CallResult;
    }
}

/** 只在載入時選擇。Lua 呼叫不建立閉包或結果資料表。 */
export const protectedCall = typeof pcall === "function" ? pcall : nodeCall;
