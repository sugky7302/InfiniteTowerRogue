---
name: rxwc3-benchmark
description: 在 WC3 中量測 RxWC3 效能的方法、執行步驟、已知陷阱與 2026 年的基準數字。修改 RxWC3 核心、評估效能、或設計高頻事件與 Signal 的用法時使用。
---

# RxWC3 效能基準

完整記錄：`docs/rxwc3/benchmark/PLAN.md`。

## 執行步驟

1. 關閉全部 WC3 視窗。遊戲佔用 `dist/bin/map.w3x` 時，建置會失敗。
2. 執行 `pnpm run bench:auto -- "<指令>" <新標籤>`。
   - 指令：`-bench`（B1 至 B4，約 7 分鐘）、`-bench-stress rx|native`（B5，約 1 分鐘）、`-bench-soak rx|native`（B6，約 5.5 分鐘）。
   - 標籤必須是新的。結果資料夾已存在時，腳本拒絕執行。
3. 遊戲視窗出現後，請使用者點擊它，使它保持在前景，直到基準完成。
4. 結果保存在 `.cache/bench/<標籤>/`。用 `pnpm run bench:decode -- <資料夾> <前綴>` 解碼。

自動模式：建置時讀取環境變數 `BENCH_AUTO`，地圖啟動 3 秒後自動執行該指令，完成後寫入 `bench-auto-done.pld`。未設定時不影響一般建置。

- 結果檔改用 file-io 的內嵌 Lua 格式。decode-bench.cjs 只讀取開始與結束的 beginusercode 區塊之間的 Preload 資料，接回後反跳脫並驗證 ITF1。舊 A0IO／AFxx 格式不再支援。
- F2 須在遊戲中確認基準結果與 bench-auto-done.pld 的讀寫，再用 bench:decode 解碼。Node 與 Lua 的通過結果不能代替此驗證。

## 已知陷阱

| 陷阱 | 處理 |
|---|---|
| WC3 視窗在背景或被隱藏時，開啟地圖後不會進入遊戲，也沒有任何輸出 | 請使用者點擊遊戲視窗。不得以 `windowsHide: true` 啟動。`AppActivate` 無效。 |
| `pnpm run x -- args` 會把 `--` 傳給腳本 | 腳本必須略過開頭的 `--`。 |
| `os.clock()` 精度約 1 ms | 每輪至少 2000 次操作，取 5 輪中位數。單輪低於精度時摘要為 `na`，請改用每輪原始資料計算。 |
| `collectgarbage` 不可用 | 無法量測記憶體。以長時間測試中「處理時間是否上升」判斷是否有累積。 |
| 批次之間交還時間太短（0.001 秒）時，畫面卡住 | 每批之間至少交還 0.03 秒，每批運算上限約 5 ms。 |
| 強制結束 WC3 時，`War3Log.txt` 不完整 | 需要記錄時，用 `CloseMainWindow()` 正常關閉。 |
| Fengari 的倍數不代表 WC3 | Fengari 預估 1.2 倍，WC3 實測 3 至 6 倍。效能結論只採用遊戲內數字。 |

## 基準數字（P3 之後，2026-11-03）

| 項目 | RxWC3（ms/次） | 備註 |
|---|---:|---|
| Subject 或 EventHub，20 個訂閱者 | 0.0025 | 約為原生的 5 倍 |
| Subject 或 EventHub，100 個訂閱者 | 0.019 至 0.023 | |
| 5 個 operator 串鏈 | 0.003 | |
| Signal 寫入，10 個依賴者 | 0.043 | 每個依賴者約 3.8 µs |
| Signal 寫入，100 個依賴者 | 0.375 | |
| `timer`／`delay`（每個） | 0.05 至 0.07 | 500 個只使用 2 個 WC3 計時器 |
| 混戰傷害事件（每個） | 0.0093 | 每秒約 600 個事件，約佔 CPU 0.5% |

## 使用建議

- 高頻事件（例如傷害）使用 Observable。
- 不要頻繁寫入依賴者很多的 signal。例如：不要讓大量介面元素依賴每次受傷都改變的生命值 signal。
- 大量需要每幀更新的物件（例如投射物），使用固定步進的幀來源，不要為每個物件建立 `interval`。
- 每個事件的固定開銷（快照、事件物件、原生函式呼叫）約 0.007 ms。首版規模不需要優化；有實測瓶頸時再處理。
- TSTL 的 `try/catch` 每次執行都建立閉包。熱點路徑使用 `src/shared/lib/rxwc3/core/protected-call.ts` 的 `protectedCall(fn, ...args)`。
