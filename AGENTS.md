# 開發規則

- 每次開發請先撰寫設計稿，先在 `docs/` 底下建立該設計的資料夾，然後新建 `PLAN.md` 於該資料夾。
    - `PLAN.md` 必須含有建立日期，以及是否完成兩個屬性。
- 撰寫時請遵守 ASD-STE100 原則，並使用正體中文書寫。
- TypeScript 檔名使用 Angular v20 命名法。
    - 使用 kebab-case，不加類型後綴。例如：`behavior-subject.ts`、`switch-map.ts`、`wc3-clock-driver.ts`。
    - 測試檔使用 `.spec.ts`。例如：`core.spec.ts`。
- TypeScript 不得使用 `enum` 或 `const enum`。
    - 固定值集合統一使用 `const` 物件、`as const` 與同名 `type`。
    - 使用 `(typeof 名稱)[keyof typeof 名稱]` 推導值的聯合型別。
    - 執行時使用物件屬性取得常數，型別註記使用同名 `type`。

```ts
export const TowerState = {
    Idle: "idle",
    Running: "running",
    Completed: "completed",
} as const;

export type TowerState = (typeof TowerState)[keyof typeof TowerState];
```

# WC3 Lua 限制

以下限制已在遊戲中實測（2026-10-26）。Node 與 Fengari 的測試無法發現這些問題。

- WC3 Lua 使用 32 位元整數與 32 位元浮點數。
    - 整數上限是 2147483647。全部整數值與中間值不得超過此上限。
    - 浮點數約有 7 位有效數字。不得以浮點數累加長時間的值（例如時間）。請改用整數單位。
    - 不得使用 `Number.MAX_SAFE_INTEGER`、`Number.MAX_VALUE`、`Number.EPSILON` 或 `2 ** 53` 等常數。TSTL 會把 `Number.MAX_SAFE_INTEGER` 轉譯為 `2 ^ 1024`，它在遊戲中等於 `0.0`。請使用明確的字面常數。
    - Node 測試請用 `Math.fround` 模擬 32 位元浮點數，並檢查整數不超過上限。
- WC3 Lua 沒有 `debug` 函式庫。
    - TSTL 的 `Error` 沒有 `stack`。把 `Error` 物件轉為字串（`print`、`tostring`、字串串接）時，會因呼叫 `debug.getinfo` 而失敗，並遮蔽原始錯誤。
    - 輸出錯誤時，請使用 `src/shared/logger.ts` 的 `logger.error`。不得直接 `print` 錯誤物件。
- TSTL 把 `for (let i = ...; ...; ...)` 轉譯為共用一個變數的 `while` 迴圈。每次迴圈不會建立新的 `i`。
    - 閉包（回呼、訂閱、計時器）在迴圈結束後讀取 `i` 時，會讀到最後的值。
    - 閉包需要迴圈變數時，請在迴圈內複製到 `const`。例如：`const id = index;`。
- 會在 WC3 中執行的程式，完成後必須在測試地圖（`pnpm run test`）中驗證。
