---
建立日期: 2026-10-26
是否完成: false
---

# i18n I1 至 I3 實作計畫

依據 `../PLAN.md` 實作程式文字、物件翻譯建置與執行時切換。不實作 I4。不新增套件，不修改 RxWC3 與 logger，不執行 Git 提交。

## 設計

1. 基準語言檔提供翻譯鍵型別。其他語言使用完整映射型別，拒絕缺少或多出的鍵。語言服務以本地 Signal 保存語言。`t()` 直接讀取該 Signal，讓本地計算自動追蹤相依。
2. 物件翻譯檔使用 `i18n/objects/<語言>.json`。值為字串或 `null`。`null` 表示未翻譯。保留既有翻譯與已刪除的鍵，建置時列出刪除鍵；執行時只納入目前有效的鍵。缺少翻譯時警告，並使用基準文字。
3. 使用 `war3-objectdata-th` 的物件修改資料辨識自訂或修改物件。僅處理修改資料中的文字欄位，不掃描全部內建物件。繼承的內建文字仍由遊戲用戶端提供。
4. 範例模組的 `compiletime` 回呼建立範例物件。建置腳本在全部回呼與物件儲存完成後，讀取最終物件檔、擷取文字、合併 JSON，並把資料寫入 Lua。主程式只替換範例 import 與 hook。其餘內容與使用者註解保留。
5. 聊天訂閱在共同流程建立，使用 `onPlayerChat`、`forLocalPlayer` 寫入語言。無效代碼只在輸入者顯示語言清單。
6. 物件管理器以本地 effect 套用技能文字，並更新已登記的單位與物品。共同流程預建列舉群組、地圖區域與進入事件。新單位由同步事件登記。物品提供建立後登記與移除前取消登記 API。全部文字只供顯示；遊戲邏輯不得讀取或比較翻譯後的名稱。

## 驗證

- Node：文字、參數、反應式切換、語言格式、兩個用戶端聊天隔離、無效代碼、物件原生呼叫、後備文字、範本合併、空物件資料。
- 型別：其他語言缺鍵與多鍵、無效翻譯鍵。
- Lua 5.3：轉譯後執行文字與語言切換，檢查原生介面呼叫方式。
- 執行 `npm run test:unit`、`npm run build`、Lua 驗證。檢查地圖 Lua 的 `2 ^ 1024` 為零。
- 遊戲內驗證尚待使用者執行。逐項操作與預期結果見下文。

## 本地原生函式待驗證

`BlzSetAbilityTooltip`、`BlzSetAbilityExtendedTooltip`、`BlzSetAbilityResearchTooltip`、`BlzSetAbilityResearchExtendedTooltip`、`BlzSetAbilityActivatedTooltip`、`BlzSetAbilityActivatedExtendedTooltip`、`BlzSetItemName`、`BlzSetItemTooltip`、`BlzSetItemExtendedTooltip`、`BlzSetItemDescription`、`BlzSetUnitName`、`BlzSetHeroProperName` 的本地執行安全性，全部待多人遊戲驗證。單位說明沒有對應的實例設定函式，僅擷取並納入翻譯資料。

| 原生函式 | 本地執行安全性 | 範例覆蓋 |
|---|---|---|
| `BlzSetAbilityTooltip` | 待驗證 | 一般技能按鈕，兩級文字 |
| `BlzSetAbilityExtendedTooltip` | 待驗證 | 一般技能按鈕，兩級延伸說明 |
| `BlzSetAbilityResearchTooltip` | 待驗證 | 套用學習說明；範例直接取得技能，不顯示學習按鈕 |
| `BlzSetAbilityResearchExtendedTooltip` | 待驗證 | 同上；須另以可學習技能確認畫面 |
| `BlzSetAbilityActivatedTooltip` | 待驗證 | 已測試原生呼叫；須另以可切換技能確認畫面 |
| `BlzSetAbilityActivatedExtendedTooltip` | 待驗證 | 同上 |
| `BlzSetItemName` | 待驗證 | 英雄背包中的護符名稱 |
| `BlzSetItemTooltip` | 待驗證 | 護符簡短說明；顯示位置依用戶端介面 |
| `BlzSetItemExtendedTooltip` | 待驗證 | 護符延伸說明 |
| `BlzSetItemDescription` | 待驗證 | 已套用；顯示位置依用戶端介面 |
| `BlzSetUnitName` | 待驗證 | 英雄的單位名稱 |
| `BlzSetHeroProperName` | 待驗證 | 英雄專有名稱 |

## 物件資料與建置順序

`src/main.ts` 匯入範例模組。TSTL 的 `war3-transformer` 先處理相依模組。範例的 `compiletime` 回呼以絕對路徑載入 `scripts/i18n-objects.cjs`。回呼使用同一個 `objectData` 建立技能 `A0I1`、物品 `I0I1` 與英雄 `H0I1`。主程式處理完成後，既有轉換器把物件資料儲存至 `dist/map.w3x/`。`scripts/utils.ts` 接著呼叫 `finalizeTranslations`，以 `war3-objectdata-th` 讀取最終物件檔、合併翻譯範本，並在 `dist/tstl_output.lua` 開頭寫入 `__i18nObjectData` 字面表。此表在範例初始化之前已存在，且會併入 `dist/map.w3x/war3map.lua`。最後，既有建置流程封裝地圖。遊戲內不讀取 JSON。

範例分別複製 `AHhb`、`ratf` 與 `Hpal`。技能有兩級文字。物品把金幣費用設為 1，確保一般物件檔也定義此代碼。已占用的範例代碼會使建置明確失敗，避免覆蓋地圖物件。原始 `maps/` 不變。

已確認目前 `maps/map.w3x/` 沒有單位、物品或技能的物件修改檔。空物件資料的擷取與三個空範本產生均已測試通過。

擷取發生在全部 `compiletime` 回呼之後。它涵蓋 WE 物件資料、範例與其他回呼較晚建立或修改的文字，不依賴模組處理順序。測試會在範例建立之後修改 Footman 名稱，儲存最終物件檔，再確認此名稱已納入 Lua。主程式原有的 Footman 修改只有模型，因此不產生名稱翻譯鍵。

判斷方式如下：

1. 取得套件 `objectData.save()` 的一般與 Skin 修改表：`w3u`、`w3uSkin`、`w3t`、`w3tSkin`、`w3a`、`w3aSkin`。
2. 讀取 `originalTable` 的內建物件修改與 `customTable` 的自訂物件修改。`newId` 為四個 NUL 時使用 `oldId`；其他情況使用 `newId`。
3. 只擷取修改表中的文字欄位。套件的 `get()` 會複製內建資料，但沒有差異就不產生修改記錄。只改模型也不產生名稱翻譯鍵。這可保留內建文字的用戶端翻譯。
4. `TRIGSTR_nnn` 透過地圖 `war3map.wts` 還原成文字。缺少字串表項目時明確失敗。`WESTRING_` 是內建字串識別碼，保留給用戶端，不當成基準中文。
5. 同一鍵同時存在於一般檔與 Skin 檔時，Skin 值優先。不以逗號拆分說明，因此參數、換行與 WC3 標籤均保留。

| 類別 | 欄位代碼與翻譯鍵欄位 |
|---|---|
| 單位 | `unam → name`、`upro → properNames`、`utip → tip`、`utub → ubertip`、`ides → description` |
| 物品 | `unam → name`、`utip → tip`、`utub → ubertip`、`ides → description` |
| 技能 | `anam → name`、`atp1 → tip`、`aub1 → ubertip`、`aut1 → untip`、`auu1 → unubertip`、`aret → researchtip`、`arut → researchubertip` |

技能說明鍵的等級從 1 起算，例如 `ability:A0I1:tip:2`。原生設定函式使用等級 1。編輯器技能名稱沒有等級。

套件目前會把各級修改讀成單一屬性，儲存時遺失等級與資料指標。腳本只包裝本次建置的 `objectData.save()`，保留原始技能修改記錄。若屬性未被建置程式修改，還原其全部原始等級資料，包括非文字欄位。先移除一般檔與 Skin 檔中的扁平化副本，再依原始檔還原。範例的兩級說明使用明確的修改記錄。沒有修改套件檔案。

## 翻譯檔格式

翻譯檔為 `i18n/objects/zh-TW.json`、`zh-CN.json` 與 `en-US.json`。格式如下：

```json
{
  "item:I0I1:name": "語言護符",
  "ability:A0I1:tip:1": null
}
```

`zh-TW.json` 每次以地圖文字更新。其他語言的新鍵為 `null`，表示未翻譯。空字串也視為未翻譯。缺少翻譯只輸出警告，不使建置失敗。執行時使用 `zh-TW`。已有的非空翻譯不被覆蓋。已刪除的鍵會列出並保留於其他語言檔，但不寫入有效的 Lua 翻譯表。範例的 16 個鍵均已有三種語言內容；簡體中文為人工翻譯。

修改翻譯檔後執行 `npm run build`，再載入新地圖。遊戲內切換不讀取磁碟上的 JSON。不建立 `_Locales` 或本地偏好檔。

## 執行時與 handle 管理

- `createI18n()` 建立獨立用戶端服務，`getI18n()` 提供正式共用服務。`t()` 與 `service.t()` 都直接讀取本地語言 Signal。公開函式與型別從 `src/shared/i18n/index.ts` 匯出。
- `localeFromClient()` 接受 `zhTW`、`zh-TW`、`zh_TW` 與大小寫差異。`zh-CN` 與 `en-US` 採相同規則。其他語言使用 `zh-TW`。聊天只接受三種正式代碼，忽略代碼兩側空白。
- 聊天在共同流程訂閱。每名玩家的分支先篩選輸入者，再經過 `forLocalPlayer`。本地分支只改 Signal 或顯示清單，不送出同步封包。
- `createObjectText()` 的 `localEffect` 設定技能文字，並巡覽已登記的單位及物品。這個流程只讀取類型、查表與設定文字，不建立原生 handle。
- `watchUnits()` 在共同流程建立地圖矩形、region、進入觸發器與列舉 group。先註冊進入事件，再列舉現有單位。新單位進入地圖時，同步事件在每個用戶端呼叫 `trackUnit()`，各自使用本地語言。group 在初始化後銷毀；region、矩形與觸發器保留至共同取消。
- `visitItems()` 在共同初始化列舉地上物品，以及所有單位的六個背包欄位。它建立的 group 與矩形在列舉後銷毀。
- 新物品必須由共同的建立流程在 `CreateItem` 或 `UnitAddItemById` 之後呼叫 `trackItem()`。範例使用 `CreateItem`、`UnitAddItem`、`trackItem`。不依賴拾取事件，所以直接進入背包的物品也能套用。
- 新單位也可在共同的 `CreateUnit` 之後呼叫 `trackUnit()`。Set 可避免重複登記導致重複更新。
- 移除物件前，遊戲系統須在共同流程呼叫 `forgetUnit()` 或 `forgetItem()`。`destroy()` 停止文字 effect 並清除登記。未通知移除的 handle 仍會保留；類型為 0 時不套用文字。
- 翻譯文字只供顯示。API 註解禁止遊戲邏輯讀取或比較翻譯後的 `GetUnitName` 等文字。所有原生介面與正式實作均在 `src/shared/wc3-def/`。

## 遊戲內驗證

本次未執行 `npm run test` 或操作遊戲。使用者須執行 `npm run test`，確認載入新建置的 `dist/bin/map.w3x`。以下全部為待驗證，不能以 Node、Lua 或建置成功代替。

| 操作 | 預期結果 |
|---|---|
| 啟動地圖 | 顯示 `BlzGetLocale` 原始值、對應語言、問候與操作說明。M5 範例不再啟動；主程式原有單位與輸出保留。記錄原始語言字串、遊戲版本與對應結果。 |
| 選取新英雄 | 玩家 0 的英雄在座標約 `(300, 0)`。玩家 1 存在時，另有可控制英雄在約 `(560, 0)`。英雄有範例技能，背包有護符。 |
| 輸入 `-lang en-US` | 只有輸入者重新看到英文程式文字。單位名稱為 `Language Guard`，專有名稱為 `Bright Light`，物品名稱為 `Language Charm`。技能按鈕為 `Light of Language: Level 1`，延伸說明為英文。若已開啟提示框，移開游標後重新指向，以排除介面快取。 |
| 輸入 `-i18n-level` | 全部用戶端的範例英雄技能共同切換為第 2 級。技能名稱顯示 `Level 2`，說明提到恢復更多生命。再次輸入回到第 1 級。 |
| 輸入 `-lang zh-CN` | 程式文字顯示簡體中文；名稱為「语言守卫」、「语言护符」，技能顯示對應等級的簡體說明。 |
| 輸入 `-lang zh-TW` | 程式文字與物件名稱回到正體中文；技能各級說明也恢復。相同語言不重複觸發 effect。 |
| 輸入 `-lang ja-JP` 或 `-lang` | 只向輸入者顯示三種可用語言。語言不變。 |
| 切換語言後輸入 `-i18n-new` | 共同建立輸入者的新英雄及背包物品。每個用戶端立即以自己的目前語言顯示，不必再切換一次語言。 |
| 任一玩家輸入 `-i18n-stop` | 共同取消聊天、事件與 effect，移除範例英雄及物品。停止後不再處理範例命令。主程式原有單位仍保留。 |

英文用戶端的字型檢查：先把遊戲用戶端語言設為英文並重新啟動，記錄原始語言值。輸入 `-lang zh-TW`，確認「你好，旅人」、「語言守衛」、「語言護符」及技能中文說明均為可辨識中文字，沒有方框或缺字。再輸入 `-lang zh-CN`，確認「语言守卫」等簡體字。即使選擇英文，問候參數「旅人」也可用來檢查中文字型。無法顯示時，記錄遊戲版本與缺字位置；本次不加入字型資產。

多人檢查須使用相同新地圖，由兩名真人玩家加入。玩家 0 切換英文，玩家 1 保持中文。兩邊的單位位置、技能等級、物品數量與戰鬥結果須相同；顯示文字可以不同。玩家 1 再切換簡體中文，玩家 0 的文字不得改變。交替切換語言、建立新物件、移動、施法與傳遞物品，持續遊玩並確認沒有不同步或離線。記錄兩邊畫面與遊戲版本。學習及啟動狀態說明的額外介面檢查，仍須使用對應類型的技能；目前範例沒有涵蓋全部提示框。

## 實際驗證結果（2026-10-26）

| 指令或檢查 | 結果 |
|---|---|
| `npm run test:unit` | 331 項通過，0 項失敗。包含既有 299 項與新增 32 項。型別檢查通過；三個負向型別案例均產生預期錯誤。 |
| `npm run build` | 最終建置 1 次通過，0 次失敗。產生 `dist/bin/map.w3x`，136413 位元組。沒有地圖被占用的錯誤。 |
| `node_modules/.bin/tstl.cmd -p tsconfig.rxwc3.json` | 1 次通過，0 項錯誤。 |
| `node .cache/rxwc3/verify-lua.cjs` | 既有 Lua 5.3 驗證 51 組通過，0 組失敗。工具沒有修改。 |
| `node scripts/verify-i18n-lua.cjs` | 新增 Lua 5.3 驗證 11 組通過，0 組失敗。涵蓋建置字面表跳脫、參數、語言切換、本地計算、物件後備、公開函式與 12 個文字原生函式的參數。 |
| 地圖產物檢查 | 5 組通過，0 組失敗。`2 ^ 1024` 為 0 處。翻譯已內嵌，M5 hook 已替換，三類一般物件檔存在，技能有兩級修改記錄。 |
| `git diff --check` | 通過，0 處空白錯誤。 |
| `npm run test` 與遊戲內操作 | 未執行。尚待使用者確認。 |

自動測試輸出保存於 `.cache/i18n-unit.log`、`i18n-build.log`、`i18n-lua.log`、`i18n-rxwc3-tstl.log` 與 `i18n-rxwc3-lua.log`。初次檢查曾有原生型別、建置環境型別與等級保存錯誤，均已修正並重跑相關完整檢查。Fengari 使用 32 位元整數與 64 位元浮點數，不能證明 WC3 字型、float32 或多人安全性。

## 檔案清單

新增：

- `docs/i18n/i1-i3/PLAN.md`
- `src/shared/i18n/locale.ts`
- `src/shared/i18n/translation.ts`
- `src/shared/i18n/chat.ts`
- `src/shared/i18n/object-text.ts`
- `src/shared/i18n/index.ts`
- `src/shared/i18n/i18n-example.ts`
- `src/shared/i18n/locales/zh-TW.ts`
- `src/shared/i18n/locales/zh-CN.ts`
- `src/shared/i18n/locales/en-US.ts`
- `src/shared/wc3-def/i18n-natives.ts`
- `src/shared/wc3-def/wc3-i18n-natives.ts`
- `scripts/i18n-objects.cjs`
- `scripts/verify-i18n-lua.cjs`
- `i18n/objects/zh-TW.json`
- `i18n/objects/zh-CN.json`
- `i18n/objects/en-US.json`
- `tests/i18n/fake-natives.ts`
- `tests/i18n/i18n.spec.ts`
- `tests/i18n/build.spec.ts`
- `tests/i18n/natives.spec.ts`
- `tests/i18n/i18n.types.spec.ts`
- `tests/i18n/i18n-lua.spec.ts`

修改：

- `docs/i18n/PLAN.md`：加入階段實作記錄，完成狀態保持 `false`。
- `src/main.ts`：只替換 M5 import 與 hook。保留其他內容與註解。
- `tests/run.ts`：加入三個 i18n 測試入口。型別測試由既有 TypeScript include 載入。
- `scripts/utils.ts`：在物件儲存完成後加入翻譯範本與 Lua 翻譯表的產生步驟。

## 差異、限制與未解決項目

1. 翻譯路徑採任務允許的 `i18n/objects/<語言>.json`，方便翻譯者集中查看。不是主計畫示例的 `i18n/<語言>/objects.json`。
2. 建置與 Lua 驗證工具使用 `.cjs`。現有轉換器會把 `.ts` 的 require 處理器改成 JavaScript 處理器，因此從 `compiletime` 直接載入未編譯 TypeScript 不可靠。所有新增 TypeScript 檔仍遵守專案檔名規則；語言檔採任務指定的名稱。
3. 自訂或修改物件只擷取明確修改的文字。未修改的繼承文字繼續使用用戶端內建翻譯，不把套件內建資料誤當成基準中文。
4. 單位說明、編輯器技能名稱沒有對應的實例顯示設定函式，只擷取與內嵌，不宣稱執行時能修改。英雄專有名稱清單採翻譯後的第一個名稱；不讀取或比較已翻譯的原生名稱，所以不保留內建的隨機名稱選擇。
5. 沒有使用 `PauseUnit`，也沒有引導施法預告，避開 M5 記錄的暫停限制。顯示使用整數等級，沒有浮點時間累加或負零。
6. 12 個原生設定函式的本地執行安全性、中文在英文用戶端的字型，以及實際 `BlzGetLocale()` 格式均待遊戲確認。Node 與 Lua 測試不能證明多人不會不同步。
7. I4 未實作。沒有 `_Locales`、本地偏好檔或自動語言轉換套件。沒有執行 Git 提交。整體 `是否完成` 保持 `false`。
8. 翻譯表由建置腳本直接寫成 Lua 字面表，沒有在 `compiletime` 回呼中讀取 JSON。這符合主計畫的 Lua 內嵌要求，並可納入全部建置期修改，避免擷取時機依賴模組順序。

## 遊戲內驗證（2026-10-26）

使用者在正體中文用戶端中執行範例。結果如下：

| 項目 | 結果 |
|---|---|
| `BlzGetLocale()` 格式 | 通過。原始值為 `zhTW`（沒有連字號），對應為 `zh-TW`。 |
| 程式文字 | 通過。三種語言都正確切換。 |
| 物品名稱與說明 | 通過。語言護符／语言护符／Language Charm。 |
| 單位類型名稱 | 通過。語言守衛／语言守卫／Language Guard。 |
| 英雄專有名稱 | 通過。明光／明光／Bright Light（簡體寫法相同）。 |
| 技能第 2 級說明 | 通過。「語言之光：第 2 級」／「Light of Language: Level 2」。 |

### 發現的問題與修正

- 英文問候語顯示為「Hello, 旅人.」。原因：範例把中文字串直接當作參數，沒有經過 `t()`。`t()` 本身正確。
- 修正：新增翻譯鍵 `example.traveler`，範例改為 `t("example.greeting", { name: t("example.traveler") })`。修正後 `pnpm run test:unit` 331 項通過，`pnpm run build` 成功。
- 規則：傳入 `t()` 的參數如果是顯示文字，也必須先翻譯。

### 不屬於地圖控制的文字

「等級1」、「傷害」、「護甲」、「物品欄」、「將物品丟進商店來出售」是 WC3 遊戲介面的文字，由用戶端語言決定。地圖沒有原生函式可以修改它們。這符合已決策事項「執行時無法修改的文字只依用戶端語言自動切換」。

### 補充驗證（2026-10-26）

| 項目 | 結果 |
|---|---|
| `-i18n-new` | 通過。新建立的單位與物品直接使用目前語言。 |
| 無效語言代碼 | 通過。輸入 `-lang fr` 時顯示「可用語言：zh-TW、zh-CN、en-US。」 |
| 英文用戶端的中文字型 | 通過。正體與簡體中文都正常顯示。 |

### 尚未驗證

| 項目 | 說明 |
|---|---|
| 多人 | 不同語言互不影響，且沒有不同步。設計稿「待驗證」第 3 項。 |
