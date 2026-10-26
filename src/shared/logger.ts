declare function print(this: void, value: unknown): void;

// 補充全域型別，讓獨立 Lua 轉譯不需要載入 Node 型別。
declare global {
    interface Console {
        log(this: void, value: unknown): void;
        warn(this: void, value: unknown): void;
        error(this: void, value: unknown): void;
    }
    var console: Console;
}

// WC3 的 Lua 沒有 `debug` 函式庫。TSTL 的 Error 沒有 `stack`，而且轉成字串時會呼叫 `debug.getinfo` 而失敗。
// 所以不得直接 print Error 物件，必須自己組出「名稱: 訊息」。
function describeError(err: unknown): unknown {
    if (typeof err !== "object" || err === null) {
        return err;
    }
    const error = err as { name?: unknown; message?: unknown; stack?: unknown };
    if (typeof error.stack === "string") {
        return error.stack;
    }
    if (typeof error.message === "string") {
        const name = typeof error.name === "string" ? error.name : "Error";
        return `${name}: ${error.message}`;
    }
    return err;
}

export const logger = {
    info(msg: unknown): void {
        if (typeof print === "function") {
            print(msg);
        } else if (typeof console !== "undefined") {
            console.log(msg);
        }
    },
    warn(msg: unknown): void {
        if (typeof print === "function") {
            print(msg);
        } else if (typeof console !== "undefined") {
            console.warn(msg);
        }
    },
    error(err: unknown): void {
        const value = describeError(err);
        if (typeof print === "function") {
            print(value);
        } else if (typeof console !== "undefined") {
            console.error(value);
        }
    },
};
