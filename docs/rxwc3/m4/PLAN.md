---
建立日期: 2026-10-26
是否完成: true
---

# RxWC3 M4 實作計畫

本計畫以 `../PLAN.md` 與本次任務為準。先建立本文件，再修改程式。不新增套件，不執行 Git 提交。

## 設計

1. Observable 保存唯讀的 `runtimeSyncKind`。預設為同步。建構函式可明確指定本地。泛型本身不能設定執行時標記。
2. 全部一般 operator 使用共同的 `deriveObservable` 工廠。工廠傳遞來源標記，也支援合併多個來源。Operator 不各自實作合併規則。直接呼叫 operator、方法版 pipe 與獨立 pipe 使用相同規則。
3. `merge` 使用共同工廠合併全部來源。`takeUntil` 保留主要來源，符合既有型別規格。Subject 的唯讀串流也使用共同工廠。
4. `mergeMap` 與 `switchMap` 在建立時不能執行投影來探測內層。新增選用的第二個參數 `innerSyncKind`。預知內層是本地時傳入 `"local"`，輸出在建立時就是本地。同步輸出若在投影後發現本地內層，將其視為串流錯誤，停止訂閱且不送出本地值。可用既有 error 處理器接收；未處理時由 `reportUnhandledError` 回報。不得在訂閱後才修改標記，因為 Signal 可能已經建立。
5. `toSignal` 使用統一標記。明確的 `options.syncKind` 可覆寫標記，以保持 API 相容。沒有標記時使用同步。`toObservable` 明確傳入 Signal 的標記。
6. `SyncNatives` 比照 M3 隔開玩家讀取、觸發器、同步註冊、送出與資料讀取。正式介面在模組內宣告原生函式；載入入口不呼叫原生函式。玩家接受原生 handle 或 `{ handle }`，相容 w3ts MapPlayer。
7. `forLocalPlayer` 在全部用戶端訂閱來源，只在擁有者的用戶端轉送值。這避免上游原生觸發器只在單一用戶端註冊。輸出是本地。`sync` 在全部用戶端建立接收觸發器，再訂閱本地來源；只有擁有者編碼並送出。送出與接收錯誤使用 `try/catch`，交由 `reportUnhandledError` 回報。編碼或解碼失敗時跳過該值，保留接收器。
8. `sync` 訂閱與取消必須在全部用戶端的共同流程執行。可辨識的 RxWC3 本地回呼期間拒絕建立訂閱。可辨識的本地取消會回報錯誤，但仍執行資源清理；它不能補救已發生的本地取消。無法辨識呼叫端自行使用 `GetLocalPlayer` 的任意分支，也不能確認其他用戶端是否執行相同程式。這項限制必須列入 API 註解。
9. 每個原生介面代表一個用戶端。其 prefix 登記表拒絕重複訂閱，包括同一串流的第二次訂閱。使用 `share()` 共用。取消後不回收 prefix，避免延遲封包送入後來的訂閱。所有用戶端必須使用相同的明確 prefix，不得以本地計數產生。
10. 本地來源完成時保留接收器，因為網路中仍可有封包。來源錯誤只回報，不在單一用戶端銷毀觸發器。呼叫端在共同流程明確取消訂閱；取消時清理來源與觸發器。

## 長度與查證

- [jassdoc 原始 common.j](https://github.com/lep/jassdoc/blob/509c14dd0f23e6847516b8a813478974268e9f44/common.j) 的 `BlzSendSyncData` 宣告使用字串並傳回布林值。文件註解對 prefix 與資料只給出約 255 位元組，並非 Blizzard 的精確上限保證。
- 第一版保守限制：資料最多 240 個 UTF-8 位元組；prefix 為 1 至 32 個 ASCII 字元，只接受英文字母、數字、底線、連字號與點號。資料拒絕 NUL。不分段。超限回報錯誤且不送出。原生送出傳回 false 時也回報錯誤。
- Lua 使用原生位元組長度；Node 計算 UTF-8 長度，包含代理對。這避免把正體中文字數誤當位元組數。精確原生上限、保守上限的送達及空資料仍待遊戲內驗證。

## 驗證計畫

- Node：執行時標記、直接 operator 與多步 pipe、合併、Signal 檢查與覆寫、未知內層拒絕與明確本地內層。
- 假網路：兩個用戶端、擁有者送出、延遲廣播、資料邊界、prefix 規則、取消清理、編碼與解碼錯誤、本地訂閱拒絕。
- 型別：本地與同步的輸入及輸出限制，原生玩家與 MapPlayer 形狀。
- Lua 5.3：擴充既有驗證工具，執行相同假原生流程及正式原生介面的呼叫方式。
- 執行 `npm run test:unit`、`npm run build`、獨立 TSTL 與 Lua 工具。檢查新產生的地圖 Lua 沒有 `2 ^ 1024`。

## 遊戲內驗證

以 M4 hook 取代 M3 hook。保留 M3 範例與 main.ts 的其他內容。遊戲內驗證尚待使用者執行。

### 單人

使用者執行 `npm run test`。本次沒有啟動遊戲，以下項目均尚待使用者確認。

| 步驟 | 預期輸出或行為 |
|---|---|
| 啟動地圖 | 顯示「M4 本地語言：zh-TW」及「M4 已啟動」。M3 傷害與施法範例不再啟動。main.ts 原有測試單位仍會建立。 |
| 等待第 2 秒 | 玩家 0 的用戶端回報「sync 資料超過 240 個位元組或含有 NUL，未送出。」。不得顯示「不應收到超長資料」。這是範例刻意觸發的錯誤。 |
| 等待第 5 秒，之後移動相機 | 每 5 秒加上網路延遲後，顯示「M4 同步相機，玩家 0：X,Y」。座標為整數。只有玩家 0 存在的單人遊戲不應顯示玩家 1 的相機值。 |
| 輸入 `-lang en`，再輸入 `-lang zh-TW` | 依序顯示「M4 本地語言：en」與「M4 本地語言：zh-TW」。相同代碼不會重複觸發 Signal。 |
| 玩家 0 輸入 `-m4-edge` | 使用 32 字元 prefix，送出 80 個「文」，共 240 個 UTF-8 位元組。顯示「M4 邊界接收：240 個位元組」。 |
| 玩家 0 輸入 `-m4-empty` | 顯示「M4 邊界接收：空字串」。若原生拒絕或不產生事件，記錄遊戲版本與結果，再調整 API 限制。 |
| 輸入 `-m4-stop`，再等待超過 5 秒 | 顯示「M4 已取消全部範例訂閱，並刪除同步觸發器」。之後不再顯示相機或語言更新。Node 及 Lua 已檢查刪除呼叫；遊戲輸出本身不能證明 handle 數量。 |

若啟動地圖後，連啟動訊息都未出現，請先檢查遊戲錯誤記錄。不要把沒有輸出視為通過。

### 多人

1. 使用同一份新建置的 `dist/bin/map.w3x`，由玩家 0 與玩家 1 透過區域網路或多開加入。須確認兩個位置均由真人控制。
2. 兩位玩家把相機移到不同位置。每次同步後，兩個用戶端應收到相同的玩家 0 座標，也收到相同的玩家 1 座標。兩名玩家各自的座標可以不同。只有對應玩家送出；另一個用戶端不得代送。
3. 玩家 0 輸入 `-lang en`。只有玩家 0 顯示本地語言變更。玩家 1 仍為 zh-TW。玩家 1 再輸入 `-lang ja`，只有玩家 1 顯示 ja。相機同步應持續。
4. 第 2 秒的超限錯誤只在玩家 0 顯示；兩個用戶端都不得收到超限值。玩家 0 分別輸入 `-m4-edge` 與 `-m4-empty`，兩個用戶端均應收到相同邊界訊息。
5. 任一玩家輸入 `-m4-stop`。聊天事件在全部用戶端的共同流程取消訂閱。兩邊都顯示取消訊息，並停止相機輸出。持續遊玩，確認沒有不同步或離線。
6. 記錄兩邊的遊戲版本、訊息順序與座標。單人、Node 或 Fengari 通過不能證明多人不會不同步。

## 實作方式、成本與差異

- 共用工廠已從入口匯出。自訂 operator 若建立新串流，也須使用 `deriveObservable`，或明確提供正確標記。任意使用 `new Observable` 的外部 operator 不會自動取得來源資訊。內建 16 個 operator 均已改用工廠。
- `runtimeSyncKind` 在建立時固定。讀取標記是常數成本。合併在建立時掃描來源一次。分發不複製訂閱者陣列。
- 本地 Subscriber 的 next、error、complete 與清理會保存本地執行環境。同步完成後才加入的清理也適用。以 `try/finally` 恢復巢狀環境。同步回呼只多一次布林判斷。本地回呼需要一個暫時閉包。
- 本地 Signal 計算與副作用也可被辨識。檢查不受 `config.checkSignalSync` 關閉影響；該設定只控制 Signal 讀取檢查。
- 依本次任務允許的方式，未知本地內層採用「明確宣告或執行時拒絕」。這比單純依泛型推導更嚴格，原因是泛型在執行時不存在，且 `toSignal` 必須先知道同步性。
- `toSignal` 增加明確覆寫的重載。傳入 `syncKind` 時，傳回型別也反映覆寫值。舊重載仍保留。手動覆寫成同步不會同步資料；使用者須對這項宣告負責。
- `sync` 在來源完成後不自動完成，且 prefix 於整個用戶端執行期間不重用。這兩點是主規格未定義的生命週期補充，用來保留在途資料及避免舊封包進入新接收器。`share()` 的最後訂閱取消後，也不可用相同 prefix 重新連接。
- 正式原生介面不會索引 userdata。Lua 驗證使用真正 userdata，確認可直接傳入原生玩家 handle。Node 型別測試比照 M3，使用 MapPlayer 的 `{ handle }` 結構，避免 WC3 全域 Location 與 Node 測試的 DOM Location 衝突。
- 與主規格相同，使用 `try/catch`、`reportUnhandledError`、明確有界常數及 `this: void`。沒有新增 npm 套件。

## 檔案清單

新增檔案：

- `docs/rxwc3/m4/PLAN.md`
- `src/shared/rxwc3/sync/execution.ts`
- `src/shared/rxwc3/sync/for-local-player.ts`
- `src/shared/rxwc3/sync/limits.ts`
- `src/shared/rxwc3/sync/sync-natives.ts`
- `src/shared/rxwc3/sync/sync.ts`
- `src/shared/rxwc3/wc3/wc3-sync-natives.ts`
- `src/shared/rxwc3/wc3/m4-example.ts`
- `tests/rxwc3/fake-sync-natives.ts`
- `tests/rxwc3/sync.spec.ts`
- `tests/rxwc3/sync.types.spec.ts`
- `tests/rxwc3/sync-lua.spec.ts`

修改檔案：

- `docs/rxwc3/PLAN.md`
- `src/main.ts`，只替換 M3 範例的 import 與 hook。
- `src/shared/rxwc3/index.ts`
- `src/shared/rxwc3/core/observable.ts`
- `src/shared/rxwc3/core/subject.ts`
- `src/shared/rxwc3/core/subscriber.ts`
- `src/shared/rxwc3/signal/index.ts`
- `src/shared/rxwc3/signal/runtime.ts`
- `src/shared/rxwc3/operators/map.ts`
- `src/shared/rxwc3/operators/scan.ts`
- `src/shared/rxwc3/operators/tap.ts`
- `src/shared/rxwc3/operators/filter.ts`
- `src/shared/rxwc3/operators/take.ts`
- `src/shared/rxwc3/operators/take-until.ts`
- `src/shared/rxwc3/operators/take-while.ts`
- `src/shared/rxwc3/operators/distinct-until-changed.ts`
- `src/shared/rxwc3/operators/merge.ts`
- `src/shared/rxwc3/operators/merge-map.ts`
- `src/shared/rxwc3/operators/switch-map.ts`
- `src/shared/rxwc3/operators/share.ts`
- `src/shared/rxwc3/operators/finalize.ts`
- `src/shared/rxwc3/operators/delay.ts`
- `src/shared/rxwc3/operators/throttle-time.ts`
- `src/shared/rxwc3/operators/debounce-time.ts`
- `tests/rxwc3/run.ts`
- `.cache/rxwc3/verify-lua.cjs`，受既有 Git 忽略規則排除，已在磁碟上修改。

## 最終驗證記錄（2026-10-26）

| 指令或檢查 | 實際結果 |
|---|---|
| `npm run test:unit` | 型別檢查通過。285 項通過、0 項失敗。包含既有 245 項與新增 40 項。沒有修改既有測試案例；只在 run.ts 加入新測試。 |
| `npm run build` | 最終建置 1 次通過、0 次失敗，產生 `dist/bin/map.w3x`，121610 位元組。沒有地圖被占用的錯誤。 |
| `node_modules/.bin/tstl.cmd -p tsconfig.rxwc3.json` | 最終獨立轉譯 1 次通過、0 次失敗。 |
| `node .cache/rxwc3/verify-lua.cjs` | 46 組通過、0 組失敗：既有 36 組、M4 共用流程 9 組、正式同步原生介面 1 組。 |
| `dist/map.w3x/war3map.lua` | `2 ^ 1024` 共 0 處。M4 啟動 hook 1 處，M3 啟動 hook 0 處。 |
| `git diff --check` | 通過，0 處空白錯誤。Git 顯示行尾轉換提示，沒有內容檢查錯誤。 |
| 遊戲內單人與多人 | 尚待使用者執行。沒有以假網路或 Lua 結果代替。 |

開發途中曾修正新增型別測試的 w3ts 全域型別衝突與 assert 匯入方式。另有一項新增測試發現同步完成後加入的本地清理遺失環境，修正後重跑全部測試通過。既有 245 項測試始終保留。

`.cache/rxwc3/m4-unit.log` 與 `m4-build.log` 保存最終指令輸出。Fengari 使用 32 位元整數與 64 位元浮點數，不能取代 WC3 的 32 位元浮點數或多人驗證。

## 尚未解決的問題

- 單人實際送達、240 位元組邊界、32 字元 prefix、空資料與原生取消仍待遊戲內確認。
- 多人相機一致性、本地語言隔離與取消後無不同步仍待確認。
- 原生精確長度上限沒有可確認的官方保證。第一版採用保守限制。
- 任意本地分支及其他用戶端的控制流程無法由此模組完整偵測。取消誤用的回報不能補救不同步。呼叫端必須遵守共同訂閱與取消規則。

程式與自動驗證已完成。遊戲內驗證尚待使用者執行，`是否完成` 保持 `false`。

## 單人遊戲內驗證（2026-10-26）

此驗證在 wc3-def 重構（`docs/wc3-def/PLAN.md`）之後執行，所以也驗證了該重構。

| 項目 | 結果 |
|---|---|
| 超限資料 | 通過。顯示「sync 資料超過 240 個位元組或含有 NUL，未送出。」，沒有收到超限值。 |
| 相機同步 | 通過。每 5 秒收到座標「128,-896」。 |
| 本地語言 | 通過。啟動時為 `zh-TW`；輸入 `-lang en` 後為 `en`。 |
| 邊界資料 | 通過。`-m4-edge` 收到 240 個位元組；`-m4-empty` 收到空字串。 |
| 取消 | 通過。`-m4-stop` 後顯示取消訊息，範例停止輸出。 |

### 發現的問題與修正

- 相機同步的訊息顯示「玩家 2」，正確應為「玩家 0」。
- 原因：TSTL 把 `for (let id = 0; ...)` 轉譯為共用一個 `id` 變數的 `while` 迴圈。計時器回呼在迴圈結束後讀取 `id`，讀到最後的值 2。JS 每次迴圈建立新的 `id`，所以 Node 測試無法發現。
- 影響：只有訊息中的編號錯誤。`player` 與 `prefix` 在迴圈內立即取得，同步本身正確。
- 修正：在迴圈內使用 `const id = index;`。此規則已加入 `AGENTS.md`。

多人驗證尚待執行。
