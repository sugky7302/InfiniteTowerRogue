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
    const stack = typeof err === "object" && err !== null
      ? (err as { stack?: unknown }).stack : undefined;
    const value = stack === undefined ? err : stack;
    if (typeof print === "function") {
      print(value);
    } else if (typeof console !== "undefined") {
      console.error(value);
    }
  },
};
