---
建立日期: 2026-10-26
是否完成: false
---

# RxWC3：魔獸爭霸3特化的響應式事件模組

## 目的

- RxWC3 參考 rxjs 的 Observable 模式，使用 w3ts 實作。
- RxWC3 是《沉冠遠征》（`docs/rogue/`）的事件與時間基礎。
- 第一批使用者是技能系統與傷害戰鬥系統。
- 程式位置：`src/shared/rxwc3/`。
- API 風格：使用 `pipe(...)` 與獨立的 operator 函式。

## 用語

| 用語 | 意思 |
|---|---|
| 串流 | 一個 `Observable`。它在時間中送出零或多個值。 |
| 同步串流 | 每個玩家的用戶端都收到相同值的串流。它可以改變遊戲狀態。 |
| 本地串流 | 值只存在於一個用戶端的串流。它只能改變畫面、聲音與介面。 |
| 事件中樞 | 一種共用來源。每種 WC3 事件只建立一個觸發器，再分發給全部訂閱者。 |
| 世界時鐘 | 可由戰術暫停停止的虛擬時間。 |
| 介面時鐘 | 戰術暫停時繼續前進的虛擬時間。 |
| 結算階段 | 同一時間點內的任務執行順序。 |

## 來自設計文件的需求

下表列出 `docs/rogue/` 中會影響 RxWC3 的規則。

| 來源 | 規則 | RxWC3 的對應 |
|---|---|---|
| 遊戲框架、搜打撤規則 | 戰術暫停停止敵人、撤離、冷卻、回魔與潮汐。 | 世界時鐘必須可以暫停。全部遊戲規則計時只使用世界時鐘。 |
| 搜打撤規則 | 選單與戰術暫停時，介面仍要回應。 | 提供另一個介面時鐘。 |
| 搜打撤規則 | 同一時間點依序結算：傷害與失能、撤離完成、潮封。 | 排程器依「時間、結算階段、加入順序」排序任務。 |
| 搜打撤規則 | 搜索4秒、撤離倒數12或18秒。離開區域或失能時取消。 | `timer` + `takeUntil` 必須可靠地取消計時，並釋放計時器。 |
| 搜打撤規則 | 敵人攻擊分為準備、作用、收招。普通預告約0.8秒，首領約1.5秒。 | 技能事件需要以串流表示施法的各階段。 |
| 搜打撤規則 | 中斷不產生半份獎勵。 | 取消時只執行清理，不送出完成值。 |
| 後續合作模式 | 首版單人，後續加入合作。 | 第一版就區分同步串流與本地串流，防止多人不同步（desync）。 |

## 範圍

### 包含

1. 核心：`Observable`、`Subscriber`、`Subscription`、`Subject`、`BehaviorSubject`、`pipe`。
2. 排程器：世界時鐘、介面時鐘、結算階段。
3. Operator（17個）：
   - 轉換：`map`、`scan`、`tap`
   - 過濾：`filter`、`take`、`takeUntil`、`takeWhile`、`distinctUntilChanged`
   - 組合：`merge`、`mergeMap`、`switchMap`
   - 時間：`delay`、`throttleTime`、`debounceTime`
   - 多播與清理：`share`、`finalize`
   - 同步：`sync`（本地轉同步）
4. 一般來源：`of`、`from`、`empty`、`never`、`timer`、`interval`。
5. WC3 來源：
   - 通用觸發器包裝 `fromTrigger`。
   - 單位事件中樞：施法各階段、傷害前、傷害後、死亡。
   - 依單位分發，例如 `onDamaged.of(unit)`。
   - 玩家聊天事件 `onPlayerChat`。存檔系統用它接收 `-save` 與 `-load` 指令。
6. 同步與本地型別區分，以及 `forLocalPlayer`、`sync`。
7. 錯誤處理：訂閱者的錯誤不會讓其他訂閱者停止。
8. Signal（參考 Angular）：`signal`、`computed`、`linkedSignal`、`effect`、`untracked`、`batch`、`toSignal`、`toObservable`，以及 `asReadOnly()`。`BehaviorSubject` 保留。

### 不包含

- Promise、async/await 與 `AsyncScheduler` 的互通。
- rxjs 的其他 operator。需要時再另開設計稿。
- Angular 的其他 signal API（`resource`、`model`、`input` 等）。
- 傷害公式、修正順序、技能資料。這些屬於戰鬥系統的設計稿。
- 存檔系統（`-save` 指令、存檔碼編碼、雜湊檢查、`CustomMapData` 檔案讀寫）。它需要另開設計稿。
  - 訂閱與閉包不能保存。讀檔後，活動狀態必須由資料重建，再重新建立訂閱。

## 設計

### 1. 資料夾結構

```
src/shared/rxwc3/
  index.ts            對外匯出
  core/               Observable、Subscriber、Subscription、Subject、pipe
  scheduler/          Clock、Scheduler、結算階段
  operators/          每個 operator 一個檔案
  sources/            of、from、timer、interval
  wc3/                fromTrigger、單位事件中樞、傷害與施法事件
  sync/               型別標記、forLocalPlayer、sync
  signal/             signal、computed、linkedSignal、effect、互通函式
```

`core/`、`scheduler/`、`operators/`、`sources/`、`signal/` 不得使用 WC3 原生函式。這樣它們可以在 Node 中測試。

### 2. 同步與本地型別

`Observable` 有第二個型別參數，表示串流的同步性。

```ts
type Sync = "sync";
type Local = "local";

interface Observable<T, K extends Sync | Local = Sync> { ... }
type LocalObservable<T> = Observable<T, Local>;
```

規則：

1. Operator 保留輸入串流的同步性。
2. `merge` 的輸入中只要有一個本地串流，輸出就是本地串流。
3. `mergeMap` 與 `switchMap` 的內層串流是本地串流時，輸出就是本地串流。
4. `forLocalPlayer(player)`：同步串流轉為本地串流。只有 `GetLocalPlayer() === player` 的用戶端送出值。
5. `sync(player, codec)`：本地串流轉為同步串流。它使用 `BlzSendSyncData` 與同步事件。值在網路延遲後送達全部用戶端。
6. 會改變遊戲狀態的 API（例如戰鬥系統的入口）只接受同步串流。把本地串流傳入時，TypeScript 編譯失敗。
7. 執行時標記（M4）：型別參數 `K` 在執行時不存在。所以本地來源（`forLocalPlayer`、`localSignal` 的 `toObservable` 等）也在 Observable 物件上設定執行時的本地標記。Operator 把標記傳給輸出串流，規則與第1至3條相同。`toSignal` 讀取這個標記。這樣大部分情況不必指定 `options.syncKind`。

`sync` 的限制：

- 只有擁有該值的玩家送出資料。
- 資料必須編碼為字串。單次 `BlzSendSyncData` 的長度有上限，上限值在實作時驗證。
- 第一版不分段。資料超過上限時，`sync` 報告錯誤。
- 送達有延遲。不得用於傷害事件內的即時修正。

每個 WC3 來源的同步性必須在實作時驗證，並寫入原始碼註解。

### 3. 排程器與時鐘

- 每個時鐘只使用一個 WC3 計時器。
- 排程器使用最小堆積，依「到期時間、結算階段、加入順序」排序。
- 計時器只在下一個任務到期時觸發，不使用固定頻率輪詢。
- `clock.pause()` 暫停計時器並記錄目前時間。`clock.resume()` 從暫停時間繼續。
- 暫停期間，世界時鐘的任務不執行。
- WC3 本身的遊戲暫停會同時停止兩個時鐘。

結算階段（第一版）：

| 階段 | 值 | 用途 |
|---|---:|---|
| `Combat` | 0 | 傷害、失能 |
| `Extraction` | 1 | 撤離完成 |
| `World` | 2 | 潮封、地形變化 |
| `Default` | 3 | 其他 |

時間 operator 接受選用的時鐘與階段參數。預設值為世界時鐘與 `Default`。

```ts
timer(12, { clock: worldClock, phase: Phase.Extraction })
```

限制：WC3 的傷害事件不是排程任務。傷害事件與計時器在同一畫格發生時，排程器不能保證順序。撤離完成時，戰鬥系統必須再檢查失能狀態。

### 4. WC3 事件中樞

- 每種玩家單位事件只建立一個觸發器（`TriggerRegisterAnyUnitEventBJ`）。
- 第一個訂閱者出現時才建立觸發器。觸發器建立後不刪除。
- 中樞用 `Map<unit, Subject>` 提供單位專屬的分發，避免每個事件都檢查全部訂閱者。
- 事件發生時，中樞把事件資料複製到一般物件，再送出。
  - 原因：`delay` 之後，`GetEventDamage()` 等函式已經沒有效果。

傷害事件：

| 串流 | WC3 事件 | 可修改 |
|---|---|---|
| `onDamaging` | `EVENT_PLAYER_UNIT_DAMAGING` | 是。`setAmount()` 等方法只在分發期間有效。 |
| `onDamaged` | `EVENT_PLAYER_UNIT_DAMAGED` | 否 |

分發結束後呼叫修改方法時，模組報告錯誤。這樣可以找出在非同步 operator 之後修改傷害的錯誤。

施法事件：`onSpellChannel`、`onSpellCast`、`onSpellEffect`、`onSpellFinish`、`onSpellEndCast`。技能系統用它們組合準備、作用、收招。

```ts
onSpellChannel.of(caster).pipe(
  filter(e => e.abilityId === FIREBALL),
  switchMap(e => timer(0.8, { phase: Phase.Combat }).pipe(
    takeUntil(onSpellEndCast.of(caster)),
    map(() => e),
  )),
).subscribe(e => castFireball(e));
```

### 5. 實體生命週期

- RxWC3 提供 `Subscription.add()`，讓一個實體收集全部訂閱。
- 實體層（`src/entity/`）提供 `destroyed$`。實體移除時，它送出值並結束。
- 單位專屬的事件串流在單位死亡時不自動結束。原因：單位可能復活或被救難流程接回。

### 6. 錯誤處理

- 預設錯誤輸出改由 `src/shared/logger.ts` 提供。
- `Subject` 用 `xpcall` 呼叫每個訂閱者。一個訂閱者發生錯誤時，其他訂閱者繼續收到值。
- 觸發器回呼也用 `xpcall` 包住。
- 錯誤送到 `config.onUnhandledError`。預設行為是用 `print` 輸出錯誤與追蹤資訊。

### 7. 效能規則

- 傷害事件的頻率高。核心路徑不得在每次送出時複製訂閱者陣列。
- 送出期間取消訂閱時，只標記為關閉。分發結束後再移除。
- 不建立未使用的 operator 物件與閉包。

### 8. Signal

Observable 處理事件。Signal 保存「一直有目前值」的狀態，例如生命、背包占用、潮汐階段。

```ts
const usedSlots = computed(() => sumSlots(backpack()));
const moveSpeedMul = computed(() => usedSlots() >= 9 ? 0.85 : 1);
effect(() => { hero.moveSpeed = baseSpeed() * moveSpeedMul(); });
```

API：

| API | 說明 |
|---|---|
| `signal(value, options?)` | 可寫入的 signal。用 `s()` 讀取，用 `set(v)`、`update(fn)` 寫入。 |
| `s.asReadOnly()` | 傳回唯讀的 `Signal`。它沒有 `set` 與 `update`。 |
| `computed(fn, options?)` | 唯讀。第一次讀取時才計算，之後快取。依賴改變時標記為過期。 |
| `linkedSignal(fn)` / `linkedSignal({ source, computation })` | 可寫入。來源改變時，值重設為重新計算的結果。`computation` 收到來源值與上一個值。提供 `asReadOnly()`。 |
| `effect(fn)` | 建立後立即執行一次。依賴改變時再執行。`fn` 收到 `onCleanup`。傳回值有 `destroy()`，而且可以傳入 `Subscription.add()`。 |
| `untracked(fn)` | 執行 `fn`，其中的讀取不建立依賴。 |
| `batch(fn)` | 合併 `fn` 中的全部寫入。最外層的 `batch` 結束後才執行 effect。 |
| `toSignal(obs$, initial, options?)` | 訂閱 `obs$`，傳回唯讀 signal。`options.owner` 是一個 `Subscription`，用來結束訂閱。 |
| `toObservable(sig)` | 訂閱時先送出目前值，之後每次改變再送出。取消訂閱時刪除內部 effect。 |

`options.equal` 用來判斷新值與舊值是否相同。預設使用 `===`。值相同時不通知依賴者。

執行規則：

1. Effect 同步執行。不在 `batch` 中時，每次寫入後立即執行受影響的 effect。
   - 原因：Lua 沒有 microtask。同步執行時，effect 仍在同一個 WC3 事件中，`GetEventDamage()` 等函式仍有效。
2. 計算不產生中間值（glitch-free）。A 影響 B 與 C 時，effect 不會讀到 B 已更新、C 未更新的狀態。
3. Effect 可以寫入 signal。同一輪中連續執行超過上限次數（預設100）時，模組停止執行並報告錯誤，以避免無限迴圈。
4. `computed` 的函式中不得寫入 signal。寫入時報告錯誤。

同步與本地：

- `Signal<T, K extends Sync | Local = Sync>`。
- `signal`、`computed`、`linkedSignal`、`effect` 建立同步的版本。`localSignal`、`localComputed`、`localLinkedSignal`、`localEffect` 建立本地的版本。
- `toSignal` 與 `toObservable` 保留輸入的同步性。
- 依賴在執行時才知道，所以 TypeScript 無法檢查 `computed` 內的讀取。模組在執行時檢查：同步的 `computed`、`linkedSignal` 或 `effect` 讀取本地 signal 時，報告錯誤。
- 這個檢查由 `config.checkSignalSync` 控制，預設啟用。

TSTL 風險：Lua 的函式不能有欄位，所以「可以呼叫，又有 `set` 方法」的物件不能直接用函式實作。建議用含 `__call` 的 metatable 實作。必須在 Lua 中驗證 `s()`、`s.set(v)` 與 `noImplicitSelf` 的呼叫方式都正確。

## 測試

1. 純邏輯（核心、排程器、operator、一般來源、Signal）：
   - 使用 Node 內建的 `node:test`，不新增套件。本機版本為 Node 26。
   - 執行指令：`pnpm run test:unit`。
   - 排程器使用假時鐘測試暫停、恢復與結算階段順序。
2. 型別：使用 `// @ts-expect-error` 確認本地串流不能傳入只接受同步串流的 API。
3. WC3 來源：在 `pnpm run test` 的測試地圖中驗證。
   - 傷害修改、施法階段、取消倒數、暫停世界時鐘。
4. 每個階段完成前，`pnpm run build` 必須成功。

## 階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| M1 | 核心與非時間 operator | Node 測試通過 |
| M1.5 | Signal | Node 測試通過；轉譯後的 Lua 中 `s()` 與 `s.set(v)` 正確執行 |
| M2 | 時鐘、排程器、時間 operator | 暫停與結算階段測試通過 |
| M3 | WC3 事件中樞、傷害與施法事件 | 測試地圖中可觀察到正確結果 |
| M4 | 同步與本地型別、`forLocalPlayer`、`sync` | 型別測試通過；同步事件在測試地圖中送達 |
| M5 | 範例：一個有預告的技能與一個傷害修正 | 範例在測試地圖中正常運作 |

M1 完成記錄（2026-10-26）：已實作核心、一般來源與 13 個非時間 operator。使用 Node 26 執行 `npm run test:unit`，94 項通過、0 項失敗。`npm run build` 與獨立 Lua 5.3 轉譯通過。使用者在本機執行 `pnpm run test:unit`，94 項通過、0 項失敗。

M1.5 完成記錄（2026-10-26）：已實作同步與本地 Signal、延遲計算、兩種連結形式、同步副作用、批次、清理及串流轉換。`npm run test:unit` 的型別檢查通過，135 項測試通過、0 項失敗，其中 Signal 新增 41 項。`npm run build` 與獨立 TSTL 轉譯通過。Lua 5.3 執行驗證共 13 組通過、0 組失敗，包含 Signal 9 組。Lua 使用含 `__call` 的 metatable，已驗證點號寫入、更新及唯讀串接呼叫。一般本地串流須以 `toSignal` 的 `options.syncKind` 提供執行時標記，原因與限制記錄於 `m1.5/PLAN.md`。Codex 沙箱無法執行 `pnpm.cmd`。使用者在本機執行 `pnpm run test:unit`，135 項通過、0 項失敗。整體完成狀態保持 `false`。

## 已決策（2026-10-26）

| 問題 | 決策 | 影響 |
|---|---|---|
| 戰術暫停由誰提供？ | RxWC3 的世界時鐘。 | 冷卻、倒數與潮汐都使用世界時鐘。單位的暫停（`PauseUnit` 等）由戰鬥系統處理。 |
| 傷害修正的順序由誰管理？ | RxWC3 只依訂閱順序分發。 | 戰鬥系統用訂閱順序或自己的階段 `Subject` 控制修正順序。 |
| 「暫停並退出」如何保存？ | 玩家輸入 `-save`。地圖把含雜湊檢查的存檔碼寫入 `CustomMapData` 下的 txt 檔。讀檔時，玩家在聊天框輸入 `-load <存檔碼>`。參考世界 RPG、西部荒野、卡利隆王國的做法。 | 存檔系統另開設計稿。RxWC3 只提供 `onPlayerChat`。聊天事件已經同步，所以讀檔不使用 `sync`。 |
| 是否自動偵測單位被移除？ | 不偵測。 | 實體層負責送出 `destroyed$`。 |
| 是否用 Signal 取代 `BehaviorSubject`？ | 不取代。兩者都保留。 | 新增 M1.5。 |
| Effect 何時執行？ | 同步執行，用 `batch()` 合併寫入。 | 不需要 flush 點。 |
| Signal API 範圍？ | `signal`、`computed`、`linkedSignal`、`effect`、`untracked`、`batch`、`toSignal`、`toObservable`、`asReadOnly()`。 | 其他 Angular API 不實作。 |
| 是否在執行時檢查本地 signal 的讀取？ | 檢查。 | 由 `config.checkSignalSync` 控制，預設啟用。 |
| Observable 是否帶執行時的本地標記？ | 是，在 M4 實作。 | Operator 傳遞標記。`toSignal` 的 `options.syncKind` 只在標記不存在時使用。 |
