---
建立日期: 2026-10-26
是否完成: true
---

# RxWC3 M1.5 實作計畫

本計畫依照 `docs/rxwc3/PLAN.md` 第 8 節與已決策表執行。設計規格以該文件為準。

1. 在 `signal/` 建立同步與本地 Signal、衍生計算、副作用及串流轉換。
2. 使用依賴版本與延遲計算。每次計算重建依賴。值相同時保留版本，避免重複執行副作用。
3. 先標記全部受影響的節點，再同步執行副作用。讀取衍生值時先更新全部來源，避免讀到中間值。
4. 巢狀批次只在最外層結束時執行副作用。副作用可以寫入。同一輪中，同一副作用最多執行 100 次。
5. 副作用繼承 `Subscription`，提供 `destroy()`。重跑與銷毀前執行清理，並用 `try/catch` 隔離錯誤。
6. 加入同步性標記與執行時檢查。串流轉換保留輸入標記。
7. Node 使用函式物件。Lua 使用含 `__call` 的 metatable。公開方法明確指定 `this: void`，使用點號呼叫。
8. 新增 Node 行為測試與型別測試，並擴充 Lua 5.3 執行驗證。不新增套件。
9. 執行全部單元測試、地圖建置與獨立 TSTL 轉譯。完成後記錄實際結果。

本次不實作排程器、時間 operator、WC3 來源或同步轉換。不修改 `BehaviorSubject` 的行為。

## 實作記錄

- 公開 API 位於 `signal/index.ts`。型別位於 `signal/types.ts`。依賴圖與執行流程位於 `signal/runtime.ts`。
- `Signal` 使用 M1 的 `Sync` 與 `Local` 型別。`config.checkSignalSync` 預設為 `true`。
- `untracked` 只停止依賴追蹤。它不能繞過同步性檢查或計算期間的寫入限制。
- `linkedSignal` 的完整形式將上一個狀態表示為 `{ source, value }`。第一次計算收到 `undefined`。手動寫入後，`value` 是目前值。
- 循環上限依同一輪中的單一副作用計數。第 101 次執行前銷毀該副作用並報告錯誤。其他副作用繼續執行。
- 錯誤隔離使用 TypeScript `try/catch`。不直接呼叫 `xpcall`。
- Lua 使用含 `__call` 的 metatable。讀取時由 `__call` 接收資料表參數。`set`、`update` 與 `asReadOnly` 使用閉包及 `this: void`，不接收隱含的 `self`。
- Node 使用函式物件。唯讀外觀共用同一個狀態節點，但不提供 `set` 或 `update`。

## 規格補充與限制

- `toSignal` 額外接受 `options.syncKind`。原因：一般 Observable 的泛型 `K` 在執行時已被移除，M1 沒有保存執行時標記。
- 型別轉換一律保留 `K`。由 `toObservable` 產生的串流也保存執行時標記，可直接轉回 Signal。
- 其他本地串流須使用 `toSignal(source, initial, { syncKind: "local" })`，才能啟用正確的執行時同步性檢查。未提供標記時使用同步標記。Operator 產生的新串流也適用這項限制。
- 本次保留 M1 的 Observable 與 Operator 行為，沒有擴大修改其同步性機制。

## 驗證記錄（2026-10-26）

- `pnpm run test:unit` 與 `pnpm run build`：指定完整路徑無法執行，共 2 個指令未能啟動。PowerShell 回報「無法將 'C:/Users/user/AppData/Roaming/npm/pnpm.cmd' 字詞辨識為 Cmdlet、函式、指令檔或可執行程式的名稱」。
- 檢查同一路徑時另回報「Access to the path 'C:\Users\user\AppData\Roaming\npm\pnpm.cmd' is denied.」。沒有新增套件或修改系統環境。
- `npm run test:unit`：型別檢查通過；135 項測試通過、0 項失敗。包含既有 M1 的 94 項及新增 Signal 的 41 項。
- 型別測試涵蓋唯讀寫入限制、本地與同步區分、串流轉換推導及兩種連結形式。
- `npm run build`：1 次建置通過、0 次失敗。產物為 `dist/bin/map.w3x`。
- `node_modules/.bin/tstl.cmd -p tsconfig.rxwc3.json`：1 次獨立轉譯通過、0 次失敗。
- `node .cache/rxwc3/verify-lua.cjs`：使用已安裝的 Fengari 執行 Lua 5.3 產物。13 組通過、0 組失敗，包含既有 4 組與 Signal 9 組。
- Lua 驗證工具先轉譯 `tests/rxwc3/signal.lua.ts`，再執行產物。已驗證 `s()`、`s.set(v)`、`s.update(fn)` 與 `s.asReadOnly()()`，以及類別方法的冒號呼叫。
- 指定的 pnpm 驗證仍待可存取的執行環境，因此本計畫的完成狀態保持 `false`。
