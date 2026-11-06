import { strict as assert } from "node:assert";
import { test } from "node:test";
import { logger } from "@shared/lib/logger";
import { config, reportUnhandledError } from "@shared/lib/rxwc3/core/config";

type Output = { log: unknown[]; warn: unknown[]; error: unknown[]; print: unknown[] };

function captureOutput(lua: boolean, check: (output: Output) => void): void {
    const savedPrint = Object.getOwnPropertyDescriptor(globalThis, "print");
    const savedConsole = { log: console.log, warn: console.warn, error: console.error };
    const output: Output = { log: [], warn: [], error: [], print: [] };
    Object.defineProperty(globalThis, "print", {
        configurable: true,
        writable: true,
        value: lua
            ? (value: unknown) => {
                  output.print.push(value);
              }
            : undefined,
    });
    console.log = (value) => {
        output.log.push(value);
    };
    console.warn = (value) => {
        output.warn.push(value);
    };
    console.error = (value) => {
        output.error.push(value);
    };
    try {
        check(output);
    } finally {
        Object.assign(console, savedConsole);
        if (savedPrint === undefined) {
            Reflect.deleteProperty(globalThis, "print");
        } else {
            Object.defineProperty(globalThis, "print", savedPrint);
        }
    }
}

for (const lua of [false, true]) {
    const environment = lua ? "模擬 Lua" : "Node";

    for (const level of ["info", "warn"] as const) {
        test(`${environment} 的 logger.${level} 使用指定的輸出函式`, () => {
            captureOutput(lua, (output) => {
                const message = { message: "測試訊息" };
                logger[level](message);
                const expected: Output = { log: [], warn: [], error: [], print: [] };
                expected[lua ? "print" : level === "info" ? "log" : "warn"].push(message);
                assert.deepEqual(output, expected);
            });
        });
    }

    test(`${environment} 的 logger.error 在沒有追蹤資訊時輸出原值`, () => {
        captureOutput(lua, (output) => {
            const values: unknown[] = ["錯誤", 0, false, null, undefined, {}, { stack: undefined }];
            for (const value of values) logger.error(value);
            const expected: Output = { log: [], warn: [], error: [], print: [] };
            expected[lua ? "print" : "error"] = values;
            assert.deepEqual(output, expected);
        });
    });

    test(`${environment} 的 logger.error 優先輸出追蹤資訊，並保留空字串`, () => {
        captureOutput(lua, (output) => {
            const failure = new Error("測試錯誤");
            logger.error(failure);
            logger.error({ stack: "追蹤資訊" });
            logger.error({ stack: "" });
            const expected: Output = { log: [], warn: [], error: [], print: [] };
            expected[lua ? "print" : "error"] = [failure.stack, "追蹤資訊", ""];
            assert.deepEqual(output, expected);
        });
    });

    test(`${environment} 的 RxWC3 預設錯誤處理器使用共用記錄模組`, () => {
        captureOutput(lua, (output) => {
            reportUnhandledError({ stack: "預設錯誤追蹤" });
            assert.deepEqual(output[lua ? "print" : "error"], ["預設錯誤追蹤"]);
        });
    });

    test(`${environment} 的 RxWC3 自訂錯誤處理器保留原始錯誤`, () => {
        captureOutput(lua, (output) => {
            const savedHandler = config.onUnhandledError;
            const failure = new Error("自訂錯誤");
            const received: unknown[] = [];
            config.onUnhandledError = (error) => {
                received.push(error);
            };
            try {
                reportUnhandledError(failure);
                assert.deepEqual(received, [failure]);
                assert.deepEqual(output, { log: [], warn: [], error: [], print: [] });
            } finally {
                config.onUnhandledError = savedHandler;
            }
        });
    });

    test(`${environment} 的 RxWC3 錯誤處理器拋出錯誤時使用共用記錄模組`, () => {
        captureOutput(lua, (output) => {
            const savedHandler = config.onUnhandledError;
            config.onUnhandledError = () => {
                throw { stack: "處理器錯誤追蹤" };
            };
            try {
                assert.doesNotThrow(() => reportUnhandledError("原始錯誤"));
                assert.deepEqual(output[lua ? "print" : "error"], ["處理器錯誤追蹤"]);
            } finally {
                config.onUnhandledError = savedHandler;
            }
        });
    });
}
