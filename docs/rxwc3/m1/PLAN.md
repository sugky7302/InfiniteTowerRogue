---
建立日期: 2026-10-26
是否完成: true
---

# RxWC3 M1 實作計畫

本計畫依照 `docs/rxwc3/PLAN.md` 與本次任務執行。設計規格以該文件為準。

1. 建立核心、一般來源、13 個非時間 operator 與對外匯出。
2. 使用型別標記保留同步性。合併本地串流時，輸出標記為本地。
3. 先連接取消關係，再訂閱來源，讓同步來源可以立即停止。
4. `Subject` 以分發深度延後移除訂閱者。每次分發只處理開始時已有的訂閱者。
5. 使用 `try/catch` 隔離訂閱者錯誤，並交給 `config.onUnhandledError`。
6. 使用 Node 內建測試與獨立型別檢查。不新增套件。
7. 執行地圖建置，並另行檢查全部 M1 檔案的 Lua 5.3 轉譯。

本次不實作排程器、時鐘、時間 operator、WC3 來源或同步轉換函式。

## 實作記錄

- 同步與本地標記只定義型別，位於 `sync/types.ts`。
- `from` 接受陣列或本模組的 `Observable`。`scan` 使用明確的初始值。
- `merge` 接受多個來源。其他 operator 使用 `pipe` 組合。
- `BehaviorSubject` 使用 `getValue()` 讀取目前值，不使用 getter。
- `share` 在引用數為零、來源完成或來源錯誤時重設連接。
- 依本次任務，錯誤隔離使用 `try/catch`，取代設計稿的直接 `xpcall` 呼叫。

## 驗證記錄（2026-10-26）

- 終端版本：Node 26.8.1。找不到 `pnpm`。工具下載受網路限制。
- `npm run test:unit`：型別檢查通過；94 項測試通過，0 項失敗。
- 型別檢查包含 `tests/rxwc3/types.spec.ts`。該檔案不在執行測試時載入。
- `npm run build`：通過，已產生 `dist/bin/map.w3x`。
- `node_modules/.bin/tstl.cmd -p tsconfig.rxwc3.json`：通過，已產生 `dist/rxwc3/rxwc3.lua`。
- 使用已安裝的 Fengari 執行 Lua 5.3 產物。轉換與取消、事件分發、內層清理、共用連接共 4 組檢查通過。
- Node 22 與 `pnpm run test:unit`、`pnpm run build` 的指定環境驗證仍待完成，因此本計畫的完成狀態保持 `false`。
