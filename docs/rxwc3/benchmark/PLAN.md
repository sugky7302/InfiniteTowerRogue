---
建立日期: 2026-10-26
是否完成: true
---

# RxWC3 效能基準

## 目的

- 在 WC3 中量測 RxWC3 的效能，確認是否達到設計目標。
- 結果用於技能系統（首版：符文學者）的設計決策。例如：每個單位各自訂閱，或集中訂閱。
- 發現瓶頸時，在 RxWC3 中修正，並重新量測。

## 初始目標

使用者於 2026-10-26 同意以下數字作為初始目標。量測後可以調整。

| 編號 | 指標 | 目標 |
|---|---|---|
| G1 | 傷害事件的分發成本 | 20 個訂閱者時，每個事件小於 0.05 ms |
| G2 | 壓力情境 | 200 個單位混戰，每秒約 300 個傷害事件，畫面不明顯掉幀 |
| G3 | 記憶體 | 每個事件的新配置很少。混戰 5 分鐘後，Lua 記憶體不持續上升 |
| G4 | 計時器 | 同時 500 個 `timer`／`delay` 時，排程正確，且只使用 2 個 WC3 計時器 |

## 量測方法

### 1. 時鐘與記憶體的探測

- WC3 Lua 是否提供 `os.clock()`，以及它的精度，目前不確定。
- `collectgarbage("count")` 是否可用，目前不確定。
- 基準程式先探測以上兩項，並輸出結果。
- `os.clock()` 不可用時，改用間接指標：固定工作量所需的次數、壓力情境下的畫面表現。

### 2. 對照組

每項基準都量測兩種寫法，並計算倍數：

- 原生寫法：直接使用 WC3 觸發器與回呼，不使用 RxWC3。
- RxWC3 寫法：使用 Observable、operator 與 Signal 完成相同工作。

原因：只看絕對時間，無法判斷 RxWC3 本身的額外成本。

### 3. 基準項目

| 編號 | 項目 | 內容 | 對應目標 |
|---|---|---|---|
| B1 | 分發 | 不經 WC3 事件，在 Lua 中直接呼叫 `Subject` 與 `EventHub` 的分發。訂閱者數量：1、20、100。 | G1、G3 |
| B2 | operator 串鏈 | 每個事件經過 5 個 operator（`filter`、`map`、`scan` 等）。 | G1、G3 |
| B3 | Signal | 改變一個 `signal`，傳播到 10、100 個 `computed` 與 `effect`。 | G3 |
| B4 | 計時器 | 同時建立 500 個 `timer` 與 `delay`。確認完成順序與 WC3 計時器數量。 | G4 |
| B5 | 實戰壓力 | 200 個單位混戰，以 `onDamaging`／`onDamaged` 處理全部傷害。記錄每秒事件數與處理時間。 | G1、G2 |
| B6 | 記憶體持久測試 | B5 持續 5 分鐘，每 30 秒記錄一次 Lua 記憶體。 | G3 |

### 4. 結果輸出

- 在遊戲畫面上輸出摘要。
- 使用 `src/shared/file-io/` 把完整結果寫入 `CustomMapData\InfiniteTowerRogue\` 下的檔案。Claude 可以直接讀取此檔案，不需要截圖。

## 執行方式

- 新增基準範例，在 `src/main.ts` 中取代目前的範例 hook。
- 以聊天指令啟動，避免進入地圖就開始長時間測試：
  - `-bench`：執行 B1 至 B4。
  - `-bench-stress`：執行 B5。
  - `-bench-soak`：執行 B6（約 5 分鐘）。

## 限制

- 基準數字會受電腦效能影響。結果記錄電腦資訊與量測日期，只用於相對比較。
- 單人遊戲無法量測多人網路延遲。

## 階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| P1 | 探測、B1 至 B4、結果輸出 | 遊戲內執行並取得結果檔 |
| P2 | B5、B6 | 遊戲內執行並取得結果檔 |
| P3 | 分析與修正 | 結果與目標比較；有瓶頸時修正並重新量測 |

## 實作記錄

### 實作前設計（2026-10-26）

- 範圍為 P1、P2。不得修改 RxWC3 核心。遊戲內驗證由使用者執行，完成屬性保持 `false`。
- `src/shared/rxwc3/benchmark/` 保存探測、統計、結果格式與 B1 至 B3 的共用工作。`wc3/` 子目錄保存聊天入口、原生計時器、B4 與混戰。
- P1 各組先暖身 1000 次，再量測 5 輪。同步工作分批執行，每批最多 25 次，批間交還遊戲。若時鐘可用，完成一批後超過 10 ms，後續批量減半，最少為 1 次。
- B4 分別檢查 500 個 `timer` 與 500 個 `delay`。原生組使用單次 WC3 計時器。分別記錄建立成本、回呼成本、經過時間與順序。RxWC3 使用獨立時鐘，查詢其兩個原生計時器。
- B5、B6 使用相同的 200 個步兵與傷害工作。兩組分開執行。B5 自動量測 30 秒；B6 自動量測 300 秒。先暖身 5 秒，並收集每秒事件數。每 30 秒記錄記憶體。測試結束或停止時清理資源。
- 結果只作為本地資料輸出。基準限制單人執行，避免本地時鐘影響多人共同模擬。
- 時間、倍數或記憶體無法量測時使用 `na`。G2 的畫面表現與 G3 的配置量沒有完整數字門檻，因此不得自動宣告通過。
- file-io 不接受換行。結果以分號分隔記錄，以逗號分隔 `key=value` 欄位。每個檔案不超過 4096 字元，超限時加上分檔編號。

### 檔案與入口

| 檔案 | 用途 |
|---|---|
| `src/shared/rxwc3/benchmark/metrics.ts` | 探測、有限數值讀取、中位數、倍數、目標判定與時鐘精度檢查。 |
| `src/shared/rxwc3/benchmark/results.ts` | ASCII 結果格式、解析與分檔。Lua 缺少值先轉為 `na`，避免欄位消失。 |
| `src/shared/rxwc3/benchmark/measurement.ts` | B1 至 B4 建立工作的分批量測。 |
| `src/shared/rxwc3/benchmark/workloads.ts` | B1 的 Subject、EventHub，B2 的五個 operator，以及 B3 的 Signal 與一般函式對照組。 |
| `src/shared/rxwc3/benchmark/wc3/runtime.ts` | WC3 探測介面、file-io 輸出與控制計時器。 |
| `src/shared/rxwc3/benchmark/wc3/p1.ts` | B1 至 B3 的暖身、輪次與摘要，並接續 B4。 |
| `src/shared/rxwc3/benchmark/wc3/timers.ts` | B4 的原生與 RxWC3 對照組，以及完整回呼成本量測。 |
| `src/shared/rxwc3/benchmark/wc3/stress.ts` | B5、B6 的單位、獨立事件來源、每秒記錄、記憶體取樣與清理。 |
| `src/shared/rxwc3/benchmark/wc3/example.ts` | 聊天入口、單人限制與 A0IO 建置期預留。保留函式庫的語言偏好讀取。 |
| `src/main.ts` | 只替換範例的 import 與 hook，其他內容不變。保留 `i18n-example.ts`。 |
| `scripts/file-io.cjs` | 同一個物件資料實例可重複預留 A0IO。仍拒絕覆蓋來自地圖或其他來源的既有 A0IO。 |
| `tests/rxwc3/benchmark.spec.ts` | 統計、格式、探測失敗、分批量測，以及 float32 原生計時器中的 B4 驗證。 |
| `tests/rxwc3/benchmark-stress.spec.ts` | B5、B6 的事件、分檔、取樣、兩組比較、停止與資源清理。 |
| `tests/rxwc3/benchmark-lua.spec.ts` | Node 與 Lua 共用的 B1 至 B3 少量工作，以及後備邏輯與格式驗證。 |
| `tests/rxwc3/benchmark-artifact.spec.ts` | 建置後檢查基準入口、MPQ 內容、A0IO 與數字限制。 |
| `tests/rxwc3/run.ts` | 加入 Node 測試入口。 |
| `scripts/verify-benchmark-lua.cjs` | 使用已安裝的 Fengari 執行 Lua 5.3 驗證。停用 `debug`，並安全讀取錯誤訊息。 |
| `package.json` | 加入 `test:benchmark:lua` 與 `test:benchmark:artifact`。 |

RxWC3 核心檔案沒有修改。B1 的 EventHub 使用已匯出的建構子、`subscribe` 與 `dispatch`；假的原生介面不建立遊戲觸發器。B5、B6 使用公開的 `createWc3Events` 與原生介面注入，各次執行都有獨立觸發器。結束後先取消訂閱，再銷毀這些觸發器。

### 量測細節

1. 探測連續呼叫 `os.clock` 4096 次，保存最小正差值。函式存在但沒有觀察到前進時，`clock=true`、`timed=false`。時鐘拋錯、倒退或回傳非有限數值時，不使用其時間。探測與量測均不依賴 `debug`。
2. B1 至 B3：各組先暖身 1000 次，再量測 5 輪，每輪 2000 次。每批最多 25 次，用 0.001 秒的原生單次控制計時器接續。只累計批內工作成本，等待不計入。記錄每輪數字與五輪中位數。總成本少於五個探測刻度時，保留原始輪次數字，摘要與 G1 使用 `na`／`unknown`。
3. B1 的每次操作為一次送出，包含全部訂閱者。B2 使用 `filter`、`map`、`scan`、`map`、`tap` 五個 operator；原生組執行相同算術。B3 的每次操作為一次寫入，包含全部 10 或 100 個 computed 與 effect。一般函式對照組產生相同結果。各輪記錄檢查值。
4. B4 分別測試 500 個 `timer` 與 500 個 `delay`。各組先跑兩波 500 次暖身，再量測五波。每波的期限為開始後 1000 至 2996 毫秒，相鄰任務相差 4 毫秒。分批建立時換算剩餘時間，保持共同絕對期限。8 秒未完成時記錄失敗。每波核對完成順序、500 次完成、同時待執行數量，以及 RxWC3 專用驅動器的兩個計時器。控制計時器與經過時間計時器不算入這兩個。原生組最多使用 500 個工作計時器。`setup_ms` 為建立成本，`dispatch_ms` 包含完整排程喚醒與回呼，`cpu_ms` 為兩者之和，`wall_ms` 包含等待。
5. B5、B6：中立額外玩家與中立敵對玩家各建立 100 個步兵。玩家 0 與兩邊暫時互為被動盟友，避免主程式單位參戰；結束時恢復原設定。單位分成 100 對，兩邊都收到攻擊對方的命令。攻擊冷卻為 0.65 秒，生命為 1000000，避免測試期間死亡。實際命中率由遊戲量測，不預先假定已達每秒 300 次。
6. 兩種混戰模式做相同工作：傷害前把傷害減半，傷害後累計整數檢查值。量測範圍包含事件資料讀取、RxWC3 分發與訂閱者工作，不包含引擎在呼叫觸發器前的成本。每秒分開記錄 `damaging`、`damaged`；`hits` 等於 `damaged`，`events` 是兩者之和。每秒都是一個量測窗口，摘要使用 30 或 300 個窗口的中位數。
7. 記憶體查詢可用時，在量測前嘗試完整回收。若也可停止與恢復 GC，只在一個工作批次或事件回呼內暫停 GC，以 KB 差值估計新配置量；結束後立即恢復。`alloc_kb_op`／`alloc_kb_event` 是含量測介面成本的估計值。GC 維持啟用的成本不包含在此 CPU 區間，數字不等於整張地圖的 CPU 使用量。無法暫停 GC 時，配置量使用 `na`，另提供 `net_kb_op`／`net_kb_event` 作為淨增量；淨增量可能為負數，不得當作總配置量。
8. B6 在暖身後的第 0 秒及第 30、60 至 300 秒取樣，共 11 筆。記錄回收前的 `raw_kb` 與完整回收後的 `retained_kb`。每秒數字每 30 秒寫出並釋放；記憶體樣本立即另存，不在 Lua 中累積樣本字串。中位數用的數字陣列先配置固定容量。這可減少量測程式本身對記憶體趨勢的影響，但不能完全移除引擎與量測介面的成本。
9. CPU 時間累計使用整數微秒。遊戲經過時間與輪次使用短區間或整數。累加成本前檢查 32 位元整數上限。沒有時鐘時，繼續輸出工作次數、事件數、完成順序與計時器數量，時間及倍數使用 `na`。
10. G1 是 B1 的 20 訂閱者純分發門檻檢查，分別記錄 Subject 與 EventHub；不代表已量測整段傷害引擎成本。G4 依 B4 的順序、同時待執行數量、完成數與計時器數量判定。G2 需要人工觀察畫面；G3 沒有配置量或趨勢的完整門檻，保持 `unknown`，留待 P3。

### 結果檔與格式

全部路徑相對於 WC3 的 `CustomMapData\InfiniteTowerRogue\`。原生預載 API 的成功只代表「已送出」，不能證明磁碟已寫入。必須確認實際檔案。

| 檔名 | 內容 |
|---|---|
| `bench-p1.pld`、`bench-p1-2.pld` 等 | 探測、設定、全部輪次、中位數、G1 至 G4 與完成標記。首檔的 `pages` 指定有效分檔總數。 |
| `bench-stress-rx.pld`、`bench-stress-native.pld` | B5 的探測、設定、摘要、目標與完成標記。 |
| `bench-soak-rx.pld`、`bench-soak-native.pld` | B6 的探測、設定、摘要、目標與完成標記。 |
| `bench-stress-rx-s1.pld` 等 | 每秒數字。`s1` 為第 1 至 30 秒，`s2` 為第 31 至 60 秒。組別與項目依檔名替換。區段超限時還會產生 `-2` 等頁碼。 |
| `bench-soak-rx-m0.pld` 等 | 記憶體樣本。`m0` 為暖身後基準；`m1` 為第 30 秒，B6 的 `m10` 為第 300 秒。B5 也會輸出 `m0`、`m1`。 |

- 以 `segments` 決定有效的秒數區段，以 `memory_samples` 決定有效記憶體樣本數。重跑時覆寫相同檔名，不刪除舊尾檔。超出本次計數的舊檔不得加入分析。
- 每個 `.pld` 為 file-io 的 JASS 預載語句。還原連續的 `BlzSetAbilityTooltip` 字串後，得到 `ITF1|長度|資料|檢查碼`。可用 `decodeFileData` 驗證並取出資料，再用 `parseRecords` 解析。
- 資料只含可列印 ASCII。記錄使用 `;` 分隔，欄位使用 `,` 分隔，鍵與值使用 `=` 分隔。不能直接以換行分割預載檔來當成基準記錄。範例：`schema=1,page=1,pages=2;type=summary,id=B2,native_ms=1,rx_ms=3,ratio=3`。
- `na` 表示不可量測、精度不足或沒有對照組。`pass`、`fail`、`unknown` 表示通過、失敗、無法判定。這些都是資料協定識別符。日期、WC3 版本與電腦資訊無可靠來源，因此不自動寫入；請在交回結果時補充電腦資訊。
- B5、B6 結束時嘗試讀取另一組同項目的摘要。只有相同 `fixture`、完整執行且秒數符合的檔案才參與比較。先執行的組別通常記錄 `comparison=missing_pair`。後執行的組別記錄兩組絕對成本、每事件成本、每秒中位數與倍數。`ratio` 比較每秒成本中位數，`ratio_event` 比較每事件平均成本。另一組檔案可能來自較早的執行；正式比較時請在同一台電腦連續執行兩組。

### 使用者執行步驟

1. 關閉會占用輸出地圖的遊戲。執行 `npm run build`。本次 Codex 工作不啟動遊戲。
2. 使用現有測試地圖流程啟動遊戲，例如在自己的終端機執行 `pnpm run test`。請使用單人遊戲。
3. 輸入 `-bench`。預期約 2 至 3 分鐘，硬體與計時器精度可能使時間增加。等待 B1 至 B4 完成訊息，確認 `bench-p1.pld` 與其 `pages` 指定的全部分檔。
4. 輸入 `-bench-stress native`。暖身 5 秒，再量測 30 秒，約 35 秒。完成後輸入 `-bench-stress rx`，同樣約 35 秒。觀察兩組的畫面表現，保存兩組摘要、秒數區段與記憶體樣本。
5. 輸入 `-bench-soak native`。暖身 5 秒，再量測 300 秒，約 5 分 5 秒。完成後輸入 `-bench-soak rx`，同樣約 5 分 5 秒。每組應有 10 個秒數區段與 11 筆記憶體樣本。全部流程預期約 13 至 15 分鐘，另加建置與載入時間。
6. 需要中止時輸入 `-bench-stop`。目前已完成的數字會寫出，並標記 `completed=false`。基準單位、事件訂閱、專用觸發器與計時器會清理。聊天入口保留，可以再啟動另一組。
7. 把本次有效 `.pld` 檔案交回，並附上電腦資訊、測試順序、是否掉幀、是否曾暫停遊戲與是否中止。量測期間請勿改變遊戲速度、開啟暫停或操作測試單位。

### 自動驗證

- `npm run test:unit`：既有 358 項加上基準測試。涵蓋格式、解析、中位數、目標、探測失敗、假時鐘、float32 B4、B5、B6 與清理。
- `npm run test:benchmark:lua`：B1 至 B3 各組少量迭代，以及後備與結果格式，共 11 組。Lua 的 `debug` 設為不可用。Fengari 使用 32 位元整數與 64 位元浮點數，不能證明 WC3 執行結果。
- `npm run build`：正式地圖轉譯與封裝。
- `npm run test:benchmark:artifact`：檢查封裝與 `dist/map.w3x/war3map.lua` 一致、基準入口存在、A0IO 已封裝，以及沒有 `2 ^ 1024`。
- `npm run format:check`：檢查專案格式。只格式化本任務修改的檔案，不修改其他檔案。

### 本次實際驗證結果（2026-10-26）

| 指令或檢查 | 結果 |
|---|---|
| `npm run test:unit` | 378 項通過，0 項失敗。包含既有 358 項與新增 20 項。 |
| `npm run test:benchmark:lua` | Lua 5.3 共 11 組通過，0 組失敗。 |
| `npm run build` | 成功封裝 `dist/bin/map.w3x`，沒有被占用的錯誤。 |
| `npm run test:benchmark:artifact` | 通過。封裝與 Lua 一致；A0IO 存在且為一級；不支援的數值常數為 0 筆。 |
| `npm run test:i18n:artifact` | 既有 8 組通過，三種語言的 `_Locales` 已封裝。 |
| `npm run format:check` | 未通過。只剩既有的 `scripts/i18n-locales.cjs`、`tests/i18n/locales.spec.ts`。已用 `git show HEAD:路徑` 的原始內容確認，兩檔在本次任務前也不通過；依範圍限制沒有修改。 |
| 本次修改檔案的 Prettier 檢查 | 全部通過。使用專案已安裝的 Prettier，僅格式化本次修改的檔案。 |
| `git diff --check` | 通過。沒有建立提交。 |

建置會更新物件翻譯範本，並提示已移除的 i18n 範例文字鍵。本次任務開始時 `i18n/objects/zh-TW.json` 沒有使用者變更；已恢復本次建置自動產生的範本變更。i18n 程式、原始翻譯檔與其他文件沒有修改。

沒有執行 `npm run test`，也沒有啟動遊戲。P1、P2 的遊戲內結果尚未取得。G2 的畫面觀察、G3 的實際記憶體趨勢，以及 WC3 中的 B4 順序與計時器數量，仍須依上述步驟驗證。P3 未執行，完成屬性保持 `false`。

## P3 設計

- 建立日期：2026-10-26。
- 是否完成：false。遊戲內重新量測由 Claude 執行。
- 先保存目前工作負載的 Lua。使用同一套 Fengari、暖身次數、工作次數與輪次，比較 B1 Subject 20／100、EventHub 20，以及 B3 10／100。只比較相對成本，不把 Fengari 時間當成 WC3 時間。
- 共用受保護呼叫在模組載入時選擇實作。Lua 直接使用 `pcall(fn, a, b)`，Node 使用 `try/catch`。具名函式明確宣告 `this: void`。
- Subject 的三種通知傳入固定函式與資料。一般 Subscriber 自行保護回呼；自訂方法由分發端保護。保留取消、終止、巢狀分發、訂閱順序與錯誤回報。EventHub 使用同一套通知函式。移除分發迴圈的 `try/finally`。
- Signal 重用失效走訪的 Set、每輪執行次數的 Map 與佇列。失效走訪不執行使用者程式；走訪完成即清除，才執行 effect。巢狀寫入共用目前的 effect 輪次，不清除外層容器。依賴以每個 Consumer 的 Map 查詢，保留動態依賴與讀取順序。
- Signal 的相等比較、計算、effect 與清理改用固定函式及受保護呼叫，明確保存並恢復追蹤狀態。清理登記函式在 effect 建立時配置。
- 批間等待至少 0.03 秒。每批以約 5 ms 為縮小批量的門檻。只累計工作開始至結束的時間，不計等待。不在每次工作間加入時鐘讀取，以免改變受測成本；首次超時或單次工作超時仍會保留實際數字。
- 新增 Node 解碼與自動執行腳本。解碼重用 file-io 的長度與檢查碼驗證。自動執行只關閉自己啟動的程序，結果保存到 `.cache/bench/<標籤>/`。Codex 只驗證腳本，不啟動遊戲。
- 既有測試斷言不變。新增必要的錯誤隔離、巢狀寫入與腳本驗證。執行單元、格式、建置、既有 Lua 驗證與產物檢查，不執行 `npm run test`，不提交。

## 自動模式（2026-10-26）

- 使用者環境沒有 computer-use 工具，所以新增自動模式，由 Claude 啟動遊戲並讀取結果檔。
- 建置時設定環境變數 `BENCH_AUTO`（例如 `BENCH_AUTO="-bench-stress rx" pnpm run build`）。地圖啟動 3 秒後自動執行該指令。
- 完成後寫入 `bench-auto-done.pld`。執行腳本偵測此檔後關閉遊戲。
- 未設定 `BENCH_AUTO` 時為空字串，一般建置不受影響。

### 專案腳本（P3）

```sh
npm run bench:auto -- "-bench" p3-p1
npm run bench:auto -- "-bench-stress rx" p3-stress-rx
npm run bench:auto -- "-bench-stress native" p3-stress-native
npm run bench:auto -- "-bench-soak rx" p3-soak-rx
npm run bench:auto -- "-bench-soak native" p3-soak-native
npm run bench:decode -- .cache/bench/p3-p1 bench-p1
npm run bench:decode -- .cache/bench/p3-p1
```

- 自動腳本直接執行 Node 建置入口，並設定 `BENCH_AUTO`。每次只建置一次。之後移除結果資料夾中的 `bench-*.pld`，再直接啟動設定中的遊戲。啟動參數為 `-loadfile <地圖> -launch -windowmode windowed`，不使用 `npm run test`。
- 等待完整的 `bench-auto-done.pld` 後，只關閉此腳本啟動的子程序。逾時、中止或遊戲提前結束時，也嘗試清理子程序並保存已產生的結果。不得同時啟動兩次自動量測。
- 結果保存到 `.cache/bench/<標籤>/`。標籤只能含英文字母、數字、底線與連字號，最多 64 字元。資料夾已存在時拒絕執行，避免覆寫。此資料夾保存原始 `.pld`、每組解碼後的 `.txt` 與執行資料 `run.json`。
- 預設等待上限為 1200 秒。可用環境變數 `BENCH_TIMEOUT_SECONDS` 調整。P3 增加批間等待，因此 P1 需要比舊版更長的時間；僅 B1 至 B3 的固定批間等待已約 4 分鐘，自適應縮小批量與 B4 還會增加時間。
- Windows 預設結果路徑為 `%USERPROFILE%\Documents\Warcraft III\CustomMapData\InfiniteTowerRogue\`。文件資料夾經過重新導向，或使用其他平台時，可用 `BENCH_DATA_DIR` 指定路徑。非 Windows 平台須在 `config.json` 設定 `winePath`、Windows 遊戲路徑，並視需要設定 `winePrefix`。
- 指定前綴時，解碼文字輸出到標準輸出。省略前綴時，為資料夾中的每組結果寫入同名 `.txt`。解碼沿用 `decodeFileData` 的長度與檢查碼驗證，不只移除 `ITF1` 標頭。依首頁的 `pages` 讀取有效分頁，忽略多餘尾檔；缺頁或資料損壞時失敗。
- 完成標記也可能在基準因錯誤而取消時產生。因此腳本還會檢查主結果的 `completed=true`，不只檢查完成檔是否存在。

## 量測結果（P1、P2，2026-10-26）

### 探測

| 項目 | 結果 |
|---|---|
| `os.clock()` | 可用。精度約 1 ms（CPU 秒）。 |
| `collectgarbage("count")` | 不可用。記憶體與配置量無法直接量測。 |

精度只有 1 ms，所以單輪量測使用 2000 次操作，並取 5 輪中位數。原生組的單輪時間常低於 1 ms，原生組的數字與倍數只能作為近似值。

### B1 至 B4

| 項目 | 原生（ms/次） | RxWC3（ms/次） | 倍數 |
|---|---:|---:|---:|
| B1 Subject，1 個訂閱者 | 低於精度 | 約 0.0015 | — |
| B1 Subject，20 個訂閱者 | 約 0.001 | 0.0145 | 約 15 |
| B1 Subject，100 個訂閱者 | 0.0030 | 0.0605 | 20.2 |
| B1 EventHub，20 個訂閱者 | 約 0.001 | 0.0135 | 約 13 |
| B1 EventHub，100 個訂閱者 | 0.0035 | 0.0625 | 17.9 |
| B2 5 個 operator 串鏈 | 低於精度 | 0.0030 | — |
| B3 Signal，10 個依賴者 | 約 0.0005 | 0.0775 | 約 150 |
| B3 Signal，100 個依賴者 | 0.0015 | 0.7370 | 約 490 |
| B4 500 個 `timer`（每個） | 0.0060 | 0.0620 | 10.3 |
| B4 500 個 `delay`（每個） | 0.0080 | 0.0800 | 10.0 |

B4：全部依序完成，RxWC3 只使用 2 個 WC3 計時器。

### B5 混戰（30 秒）

| 項目 | 原生 | RxWC3 |
|---|---:|---:|
| 每秒命中（中位數） | 312 | 314 |
| 事件總數（傷害前與傷害後） | 18470 | 18472 |
| 每個事件 | 0.0023 ms | 0.0096 ms（約 4.1 倍） |
| 每秒處理時間（中位數） | 約 1 ms | 約 6 ms |

### B6 持久測試（300 秒）

| 30 秒區段 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 原生（ms/秒） | 1.57 | 1.03 | 1.30 | 1.10 | 1.13 | 1.27 | 1.33 | 1.00 | 1.27 | 1.07 |
| RxWC3（ms/秒） | 6.56 | 7.66 | 7.29 | 7.54 | 7.43 | 6.44 | 7.33 | 6.44 | 7.33 | 7.86 |

RxWC3 每個事件平均 0.0116 ms。處理時間沒有隨時間上升。

### 目標判定

| 目標 | 判定 | 依據 |
|---|---|---|
| G1 | 通過 | 20 個訂閱者：Subject 0.0145 ms，EventHub 0.0135 ms，低於 0.05 ms。 |
| G2 | 通過（以 CPU 判定） | 每秒約 600 個事件，RxWC3 每秒約 7 ms（0.7%）。自動模式沒有觀察畫面，所以未以畫面判定。 |
| G3 | 部分判定 | 記憶體無法量測。5 分鐘內處理時間沒有上升，沒有訂閱者累積的跡象。每個事件的配置量未知。 |
| G4 | 通過 | 500 個計時器依序完成，只使用 2 個 WC3 計時器。 |

### 成本來源分析

- 每多一個訂閱者，RxWC3 約為原生的 18 至 20 倍。
- 原因：TSTL 把 `try/catch` 轉譯為 `pcall(function() ... end)`，每次執行都建立新的閉包。通知一個訂閱者時：
  - `Subject.dispatch` 建立 2 個閉包並呼叫 1 次 `pcall`。
  - `Subscriber.next` 再建立 2 個閉包並呼叫 1 次 `pcall`。
  - `Subject.next` 每次送出值時另外建立 1 個 `notify` 閉包。
- Signal 每次寫入建立新的 `Set`、`Map` 與 `untracked` 閉包，傳播成本約為每個依賴者 7 µs。
- 這些閉包也是 GC 的負擔。`collectgarbage` 不可用，所以無法量測。

## P3 實作記錄

建立日期：2026-10-26。是否完成：false。以下結果來自 Codex；遊戲內重新量測尚未執行。

### 修改內容

| 檔案 | 修改 |
|---|---|
| `src/shared/rxwc3/core/protected-call.ts` | 載入時選擇 Lua 原生 `pcall` 或 Node 的具名 `try/catch` 函式。保留參數數量與 Lua 多重回傳，不在 Lua 熱路徑建立結果資料表。 |
| `src/shared/rxwc3/core/config.ts` | 錯誤回報使用共用受保護呼叫。 |
| `src/shared/rxwc3/core/subscriber.ts` | 一般 `next` 直接保護 observer；本地狀態明確保存與恢復。具名通知函式辨識一般方法與自訂方法，避免一般方法重複保護。終止通知也保護自訂取消方法。 |
| `src/shared/rxwc3/core/subject.ts` | 三種通知傳入固定函式與資料。分發迴圈不使用 `try/finally`，不複製訂閱陣列。 |
| `src/shared/rxwc3/sync/execution.ts` | 提供內部狀態設定函式，供本地回呼恢復執行狀態。沒有加入公開入口的匯出。 |
| `src/shared/rxwc3/wc3/event-hub.ts` | 分發使用相同通知函式。移除迴圈的重複保護與 `try/finally`。原生事件回呼使用固定受保護呼叫。 |
| `src/shared/rxwc3/signal/runtime.ts` | 重用走訪 Set、每輪計數 Map 與佇列。依賴記錄保存 Map 索引與讀取游標。反向依賴使用可重用的雙向連結，重新讀取時接回尾端，以保留通知順序。移除 `find` 回呼、每輪清理登記閉包與內部 `untracked` 閉包。預設相等比較直接使用 `===`；自訂比較仍受保護且不追蹤依賴。 |
| `src/shared/rxwc3/benchmark/measurement.ts` | 縮小批量的門檻改為 5000 µs。單次工作或首次批次仍可能超過門檻，超時數字照實保留。 |
| `src/shared/rxwc3/benchmark/wc3/runtime.ts` | 預設批間等待改為 0.03 秒。 |
| `src/shared/rxwc3/benchmark/wc3/p1.ts` | 設定記錄加入批次預算與等待時間。 |
| `scripts/decode-bench.cjs` | 解碼結果、驗證框架與分頁，重用既有 TypeScript codec。 |
| `scripts/run-bench.cjs` | 自動建置、啟動、等待、停止自身子程序、保存與解碼。 |
| `scripts/benchmark-lua.cjs` | 保存 Lua 工作負載、執行 Fengari 前後比較、檢查分發函式與數字常數。 |
| `scripts/verify-benchmark-lua.cjs` | 保留原有 11 組斷言，增加 P3 共用驗證與每個一般訂閱者一次保護的檢查。 |
| `tests/rxwc3/benchmark-p3-lua.spec.ts` | Node 與 Lua 共用的七組相容性檢查。 |
| `tests/rxwc3/benchmark-p3.spec.ts` | 新增六項 Node 測試，涵蓋相容性、參數數量、本地狀態、5 ms 門檻、解碼與自動流程。 |
| `tests/rxwc3/run.ts` | 載入新增測試。 |
| `package.json` | 增加 `bench:auto`、`bench:decode` 與 `bench:lua`。沒有新增套件。 |
| `tsconfig.rxwc3.json` | 獨立函式庫轉譯排除建置期基準範例，避免無 transformer 時解析 Node 的 `process`。正式地圖仍包含該範例。 |
| `docs/rxwc3/benchmark/PLAN.md` | 加入 P3 設計、記錄、腳本用法與使用建議。 |

失效走訪不執行使用者程式，完成後先清除走訪 Set，再執行 effect。Effect 中的寫入加入目前佇列，共用目前輪次的計數 Map。只有最外層結算結束時才清空佇列與計數。這樣不會因巢狀寫入而重設 100 次的循環上限。

一般訂閱者與直接拋錯的自訂方法，每次通知只需一次受保護呼叫。自訂方法若呼叫 `super.next()`，仍須保留基底回呼的保護，再由外層保護自訂程式。這是相容性例外：回呼錯誤仍須先回報，且自訂方法在 `super.next()` 後的程式仍須執行。若強制合併為一次保護，將改變這個既有行為。新增共用測試已覆蓋兩種錯誤各自回報。

### Fengari 前後比較

使用 `.cache/rxwc3/verify-lua.cjs` 使用的同一套 Fengari 0.1.5。兩份工作負載都由 TSTL 轉譯。`before.lua` 在核心修改前保存。每輪建立相同工作，先暖身 200 次，再量測 500 次，共 7 輪，取中位數。建立、清理、原生對照與檢查值核對不計入時間。停用 `debug`，不呼叫不可用的 `collectgarbage`。兩組都核對原生工作負載的檢查值。

| 項目 | 優化前（ms／500 次） | 優化後（ms／500 次） | 加速倍數（前／後） |
|---|---:|---:|---:|
| B1 Subject，20 個訂閱者 | 37.130 | 31.474 | 1.180 |
| B1 Subject，100 個訂閱者 | 175.396 | 145.706 | 1.204 |
| B1 EventHub，20 個訂閱者 | 37.556 | 31.022 | 1.211 |
| B3，10 個依賴者 | 283.528 | 221.052 | 1.283 |
| B3，100 個依賴者 | 2845.428 | 2246.890 | 1.266 |

以上是同一個 Node 程序中的相對比較，包含直譯器與主機 GC 的影響。Fengari 使用 32 位元整數與 64 位元浮點數，絕對時間不代表 WC3，也不能推算 WC3 的加速倍數。原始快照與結果保存在 `.cache/bench/p3/`，未加入版本控制。可用下列指令重現比較或在下一次修改前保存快照：

```sh
npm run bench:lua -- snapshot .cache/bench/p3/next-before.lua
npm run bench:lua -- compare .cache/bench/p3/before.lua .cache/bench/p3/after.lua
npm run bench:lua -- inspect dist/map.w3x/war3map.lua
```

### 轉譯結果檢查

- 地圖 Lua 的 `Subject.next`、`error`、`complete`、`dispatch`、`Subscriber.next`、本地通知輔助函式、`notifyNext`、`callNext` 與 `EventHub.dispatch` 均沒有內部 `function` 宣告。分發不再透過 `pcall(function() ... end)` 包裝。
- 共用 Lua 呼叫直接指向原生 `pcall`。一般 `next` 的形式為 `local ok, error = protectedCall(self.observer.next, value)`。沒有額外的 `self`、參數資料表或回傳資料表。
- Fengari 以計數版 `pcall` 驗證 Subject 與 EventHub 的 20 個一般訂閱者，各恰好使用 20 次保護。共用工作負載與舊 Lua 驗證也確認值與方法呼叫正確。
- 原生觸發器的回呼只在建立觸發器時配置，執行回呼時不再配置保護閉包。
- 地圖 Lua 中的 `2 ^ 1024` 為 0 筆。

### 驗證結果

| 驗證 | 結果 |
|---|---|
| `npm run test:unit` | 384 項通過，0 項失敗。既有 378 項全部保留，新增 6 項。 |
| `npm run format:check` | 通過。 |
| `npm run build` | 成功封裝 `dist/bin/map.w3x`，沒有檔案占用錯誤。 |
| 獨立轉譯後執行 `.cache/rxwc3/verify-lua.cjs` | 51 組通過，0 組失敗。 |
| `npm run test:benchmark:lua` | 18 組通過，0 組失敗。包含既有 11 組與 P3 新增 7 組。 |
| `npm run test:benchmark:artifact` | 通過。入口、封裝、A0IO 與數字限制均通過。 |
| `bench:lua inspect` | 指定分發函式沒有內部閉包；不支援的數字常數為 0 筆。 |
| 解碼實際舊結果 | 已成功解碼現有的 `bench-soak-rx.pld`，驗證長度與檢查碼。此檔屬於舊量測，不是 P3 遊戲結果。 |
| 自動工具流程 | 注入建置與遊戲程序介面驗證建置一次、刪除舊結果、啟動參數、只停止自身程序、複製與解碼。沒有啟動真實遊戲。 |
| 既有測試斷言 | 沒有修改。 |

沒有執行 `npm run test`、啟動 WC3 或建立 git commit。使用者既有的翻譯與其他修改保持不變。遊戲畫面、WC3 效能與真實自動啟停仍由 Claude 重新驗證，因此文件的完成屬性保持 `false`。

## 使用建議

- 不要頻繁寫入依賴者很多的 signal。一次寫入會同步走訪依賴圖，並執行受影響的 effect。
- 高頻事件使用 Observable。需要保存目前狀態時再使用 Signal。
- 多筆相關狀態可用 `batch` 合併寫入，減少重複結算。只讀取需要的 computed，保留延遲計算的效益。

## P3 遊戲內重新量測（2026-11-03）

### 執行問題

- 前 4 次自動重測都逾時。原因不是 P3 的程式：Claude 從終端機啟動 WC3 時，使用者正在使用其他視窗，Windows 不允許背景程式取得焦點。WC3 在背景時，開啟地圖後不會進入遊戲，所以沒有執行任何 Lua。
- 使用者點擊遊戲視窗後，基準正常執行。`scripts/run-bench.cjs` 已加入提示：啟動後請點擊遊戲視窗，使它保持在前景。
- `pnpm run bench:auto -- ...` 會把 `--` 傳給腳本。`run-bench.cjs` 與 `decode-bench.cjs` 已改為略過開頭的 `--`。
- 每批之間交還 0.03 秒後，B1 至 B4 約需 6.7 分鐘（優化前約 2 分鐘），測試期間畫面不再卡住。

### B1 至 B4 前後比較

數字由每輪的原始資料計算中位數（2000 次操作／輪）。P3 後許多項目的單輪時間低於判定門檻，摘要顯示為 `na`，所以改用原始資料。

| 項目 | 優化前（ms/次） | 優化後（ms/次） | 加速 |
|---|---:|---:|---:|
| B1 Subject，20 個訂閱者 | 0.01449 | 0.00250 | 5.8 倍 |
| B1 Subject，100 個訂閱者 | 0.06049 | 0.01900 | 3.2 倍 |
| B1 EventHub，20 個訂閱者 | 0.01350 | 0.00248 | 5.4 倍 |
| B1 EventHub，100 個訂閱者 | 0.06249 | 0.02301 | 2.7 倍 |
| B2 5 個 operator 串鏈 | 0.00300 | 0.00301 | 不變 |
| B3 Signal，10 個依賴者 | 0.07750 | 0.04341 | 1.8 倍 |
| B3 Signal，100 個依賴者 | 0.73700 | 0.37541 | 2.0 倍 |
| B4 `timer`（每個） | 0.0620 | 0.0501 | 1.2 倍 |
| B4 `delay`（每個） | 0.0800 | 0.0700 | 1.1 倍 |

- Fengari 預估只有 1.2 至 1.3 倍。WC3 的 Lua 建立閉包與 `pcall` 的成本較高，所以實際效果較大。
- 分發仍比原生慢（20 個訂閱者約 5 倍），但已從約 15 倍降低。
- Signal 每個依賴者約 3.8 µs。使用建議不變：不要頻繁寫入依賴者很多的 signal。
- 結果檔：`.cache/bench/baseline/`（優化前）、`.cache/bench/p3-p1/`（優化後）。

### B5 前後比較（2026-11-03）

| 項目 | 優化前 | 優化後 |
|---|---:|---:|
| 每秒命中（中位數） | 314 | 314 |
| 每個事件 | 0.0096 ms | 0.0093 ms |
| 每秒處理時間 | 約 6 ms | 約 5 ms |

- B5 只改善約 3%。B5 的每個事件只有 1 至 2 個訂閱者，成本主要是每個事件的固定開銷：事件快照、`DamagingEvent` 物件、原生函式呼叫與中樞的三路合併。P3 只優化「通知每個訂閱者」的部分。
- 每秒約 600 個事件時只佔 CPU 約 0.5%。首版規模不需要再優化。技能系統上線後，若量測到瓶頸再處理。

### 自動執行的另一個問題

- `scripts/run-bench.cjs` 以 `windowsHide: true` 啟動 WC3，遊戲視窗被隱藏，使用者無法點擊。已改為 `false`。
- 結果：`.cache/bench/p3-stress-rx-2/`。

### 結論

- G1、G2、G4 通過。G3 無法直接量測記憶體；5 分鐘內處理時間沒有上升，沒有訂閱者累積的跡象。
- P3 使分發快 3 至 6 倍、Signal 快約 2 倍，實戰（B5）影響很小。
- 使用建議：高頻事件使用 Observable；不要頻繁寫入依賴者很多的 signal；每幀更新的大量物件（例如投射物）考慮固定步進的幀來源。
