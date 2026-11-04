---
建立日期: 2026-11-04
是否完成: false
---

# 物品欄介面（首版）

## 目的

- 以自訂框架（frame）建立物品欄：英雄模型與穿戴位置、90 格背包、數值面板。
- 背包保存原生物品，可以丟到地面，也可以撿回。
- 取代聊天指令 `-items`、`-equip`、`-unequip` 的日常操作。聊天指令保留，供測試使用。

## 參考

使用者提供的參考畫面有四個面板：天賦、穿戴位置（含英雄模型）、數值清單、6×5 背包格子。

| 來源 | 採用的做法 |
|---|---|
| [TasItemBag](https://www.hiveworkshop.com/threads/tasitembag.338469)（Tasyen） | 背包是按鈕格子，每格最多一件物品；以物品欄旁的按鈕開關；每名英雄一個背包 |
| [Inventory & Equipment UI System](https://www.hiveworkshop.com/threads/inventory-equipment-ui-system-v1-4-3.291826/latest) | 穿戴位置與背包分開；工具提示另成模組 |
| [The Big UI-Frame Tutorial](https://www.hiveworkshop.com/pastebin/913bd439799b3d917e5b522dd9ef458f20598/) | 框架規則與陷阱（見下節） |
| [UI: EditBox](https://www.hiveworkshop.com/threads/ui-editbox-text-input.316239/)、[Frames & Multiplayer](https://xgm.guru/p/wc3/Frames--Multiplayer-3kU) | 本地輸入以同步事件送出，再改變同步狀態 |

## 參考文件評估：`Warcraft3_Advanced_System.md`（Gemini 產生，2026-11-04）

此文件只作為想法來源，不直接使用程式碼。

採用的想法：

| 想法 | 本專案的做法 |
|---|---|
| 先點選一格，再點另一格就交換（`handleSlotClick`） | 取代拖放。持有清單內交換順序；點選持有物後點穿戴位置也可穿上 |
| FDF 按鈕樣板：邊框＋滑鼠移入發光（`GoldTalentButtonTemplate`） | U2 實驗。須在建置時加入 TOC 並以 `BlzLoadTOCFile` 載入，文件沒有寫這一步 |
| 滑鼠移入時更新固定的說明面板（`FRAMEEVENT_MOUSE_ENTER`） | 可與工具提示並用。更新文字只在本地執行 |
| 不可用時改用 `CommandButtonsDisabled\DISBTN` 圖示 | 用於空格或不能穿的物品 |

不採用的部分與原因：

| 部分 | 問題 |
|---|---|
| 第 3 節存讀檔 | `BlzSendSyncPtr`、`ConvertStringToTriggerString`、`MergeLocalAndDataDelta` 不是 WC3 原生函式；`PreloadGenClear`／`Start`／`End` 順序錯誤；JSON 的引號會破壞 JASS 字串；沒有處理同步資料長度上限。本專案的存檔系統已驗證，不更換 |
| 背包保存原生物品 handle | 本專案的物品是純資料（`ItemInstance`），不建立原生物品 |
| 模擬使用物品（暫時放入原生第 1 格再下命令） | 本專案沒有可使用的物品 |
| `AlertBox` 在 `GetLocalPlayer` 區塊內 `CreateTimer` | 在本地區塊建立 handle 可能不同步 |
| `Frame.create(name, parent, 0, 0, "BACKDROP", "")` | 與 w3ts 的介面不符（`Frame.create` 建立 FDF 框架，依型別建立應使用 `Frame.createType`）。本專案在 `shared/wc3-def` 自行包裝原生函式 |
| 對 `GLUEBUTTON` 直接 `setTexture` | 按鈕本身不顯示圖示，須在內部放 `BACKDROP` |
| 以 `TEXT` 型別建立文字但不設定字型 | 可能不顯示。列入待實驗 |

## 框架規則（來自參考）

1. 框架在遊戲時間 0 秒後建立，不在地圖初始化建立。
2. 全部玩家建立相同的框架。只用 `GetLocalPlayer` 控制可見性（`BlzFrameSetVisible`）。
3. `BlzGetFrameByName`、`BlzGetOriginFrame` 不得第一次在 `GetLocalPlayer` 區塊內呼叫，否則可能不同步。先存到變數。
4. 框架事件（`BlzTriggerRegisterFrameEvent`）是同步的，事件值可以安全使用。`BlzFrameGetText`、`BlzFrameIsVisible` 是本地值，不得用於改變遊戲狀態。
5. 點擊後按鈕保留鍵盤焦點，空白鍵或 Enter 會再點一次。處理方式：點擊後 `BlzFrameSetEnable(false)` 再 `true`。
6. 座標範圍 0～0.8 × 0～0.6（4:3 區域）。重新定位前先 `BlzFrameClearAllPoints`。
7. 圖示使用 `BACKDROP` 放在 `BUTTON` 內，`BlzFrameSetAllPoints` 對齊，`BlzFrameSetTexture(frame, path, 0, true)`。
8. 工具提示（`BlzFrameSetTooltip`）只在本地顯示。

## 重大發現：3.0 內建裝備欄與背包（2026-11-04）

使用者提供參考地圖（`humanre01.files/`，不納入版本控制）。分析結果：

- 參考畫面的紙娃娃、背包格子與數值清單不是自訂框架。地圖腳本只用少量框架函式。
- 遊戲 3.0（使用者為 3.0.1.24371）的 `common.j` 有內建裝備欄與背包：
  - 9 個裝備位置：`EQUIPMENT_LOADOUT_SLOT_HEAD`、`CHEST`、`GLOVES`、`BOOTS`、`PRIMARY`、`OFFHAND`、`RING`、`RINGALT`、`TRINKET`。
  - 物品類別 `ITEM_TYPE_EQUIPMENT`、`GetItemEquipmentType`、`ConvertEquipmentType`。
  - `UnitEquipItem`、`UnitUnequipItem`、`UnitItemInEquipmentSlot`、`UnitItemInBagSlot`、`UnitExtendedInventorySize`、`IsItemInBag`。
  - 事件 `EVENT_PLAYER_UNIT_EQUIP_ITEM`、`EVENT_PLAYER_UNIT_UNEQUIP_ITEM`。
- 參考地圖以撿起物品 `ttal` 開啟天賦，以 `ebtf`、`ecgb` 等內建裝備物品示範裝備。
- 專案型別為 war3-types-strict 1.33.0，沒有這些宣告。套件內有 3.0.0 版。


### 實驗結果（2026-11-04，使用者操作）

| 實驗 | 結果 |
|---|---|
| 英雄沒有物品欄技能 | 物品欄 0，不能撿起任何物品 |
| 加入 `AInv` | 物品欄 6，延伸物品欄 0。一般物品（天賦之書）可以撿起 |
| 內建裝備物品（`ebtf` 等） | 是裝備類別，但不能撿起；`UnitAddItem` 傳回 false。英雄收到 smart 命令但不移動 |
| 內建英雄 `Hctl`、`Hctr`、`Hpal`、`Hamg` | 技能都是 `AInv,AHer,Aatk,Amov`，延伸物品欄都是 0 |
| 加入參考地圖的地圖旗標位元 19、23、24、25 | 延伸物品欄仍為 0。參考地圖的地圖選項沒有背包或裝備相關項目 |

結論：內建背包與裝備欄在自訂地圖中無法啟用（推測只限戰役）。採用自訂背包（下列決策）。英雄保留 `AInv`，供撿起一般物品。實驗程式已移除。

## 決策

使用者決定（2026-11-04）：

| 問題 | 決策 |
|---|---|
| 背包格數 | 90 格 |
| 英雄模型預覽 | 要 |
| 背包內容 | 原生物品。物品可以丟到地面，也可以從地面撿回 |
| 知識面板 | 知識體系取代天賦，但畫面類似參考畫面的天賦面板。另立設計稿，不在本設計 |

依上述決定推導的預設值：

| 問題 | 決策 | 原因 |
|---|---|---|
| 首版面板 | 英雄模型與穿戴位置、背包、數值面板 | 知識面板另立設計稿 |
| 穿戴位置 | 4 格：主武器、副手、防具、工具 | 沿用現有規則 |
| 背包版面 | 3 頁，每頁 6×5＝30 格，以頁籤切換 | 參考畫面一頁 30 格；90 格放不進 4:3 區域 |
| 物品的真實資料 | 仍是 `ItemInstance`（基底、階級、詞綴）。原生物品只是載體 | 穿戴規則、數值匯總與存檔都使用純資料 |
| 原生物品與資料的對應 | 每個物品基底一種原生物品類型（建置時產生）。`SetItemUserData` 保存物品編號，登錄表以編號找到 `ItemInstance` | 原生物品沒有欄位可以保存詞綴 |
| 背包中的原生物品 | 隱藏（`SetItemVisible(false)`），不在英雄的原生物品欄 | 原生物品欄只有 6 格 |
| 丟棄 | 點選物品後點「丟棄」按鈕。物品出現在英雄腳下，可以被撿起 | 框架沒有拖到地面的事件 |
| 撿起 | 英雄撿起已登錄的物品時，系統把它移出原生物品欄，放進第一個空格。背包已滿時留在地面並顯示原因 | 參考 Gemini 文件的拾取攔截 |
| 操作 | 點選一格後再點另一格：背包內交換；背包到穿戴位置＝比較後穿上；穿戴位置到背包＝卸下。點同一格取消選取 | 框架沒有原生拖放 |
| 失敗 | 不改變狀態，顯示全部原因 | 沿用穿戴規則 |
| 開關 | 物品欄旁一個按鈕，以及聊天指令 `-bag` | 參考 TasItemBag |
| 說明 | 滑鼠移入時更新說明面板：名稱、階級、固定屬性、詞綴；背包物品另顯示與同位置裝備的差值 | 沿用 `compareEquipment` |
| 數值面板 | `-hero` 的二級數值，百分比以「%」顯示 | 修正已知限制 |
| 英雄模型 | `SPRITE` 框架設定英雄模型並播放站立動作 | 須先實驗 |

## 存檔影響

- 目前的版本 3 只能保存 4＋12 個物品位置，每個位置固定占位元。
- 4＋90 個位置全放傳世物品時，固定格式約 611 位元組，超過打包上限 512 位元組。
- 改為版本 4：只保存有物品的格子。每件物品保存格子編號（0～93）、基底、階級，以及該階級數量的詞綴。
  - 普通物品約 26 位元，傳世物品約 59 位元。
  - 最壞情況（94 件傳世物品）約 700 位元組。打包上限與存檔碼長度上限須提高。
- `SaveRegistry` 須新增「可變長度紀錄清單」欄位種類（數量＋紀錄）。屬於 `features/save` 的通用功能。
- 版本 3 轉換為版本 4：位置 0～3 不變，持有清單 4～15 放到背包第 1～12 格。
- 範例的分段同步每片 20 位元組，最多 64 片。版本 4 的最長存檔超過此限制，改用預設的 200 位元組。
- 手動分段輸入的段數增加（最壞約 17 段）。自動讀檔仍是主要方式。

## 框架函式庫：w3ts `Frame`

使用者指定參考 [w3ts Frame](https://cipherxof.github.io/w3ts/docs/api/classes/frame)。專案已安裝 w3ts 3.0.2（`node_modules/w3ts/handles/frame.d.ts`）。

- 建立：`Frame.create`（FDF 樣板）、`Frame.createType`（以類型建立，例如 `BACKDROP`、`GLUEBUTTON`、`TEXT`、`SPRITE`）、`Frame.createSimple`。失敗時傳回 `undefined`，必須檢查。
- 取得：`Frame.fromOrigin`、`Frame.fromName`、`Frame.fromHandle`、`Frame.fromEvent`。
- 版面：`setPoint`、`setAbsPoint`、`setAllPoints`、`clearPoints`、`setSize`、`setLevel`、`setScale`。
- 內容：`setTexture`、`setText`、`setFont`、`setTextColor`、`setTooltip`、`setVisible`、`setEnabled`、`setFocus`。
- 模型預覽：`setModel(modelFile, cameraIndex)`、`setSpriteAnimate(primaryProp, flags)`（I3 實驗 3）。
- 樣板：`Frame.loadTOC(filename)`（I3 實驗 1、2）。
- 文件沒有事件登錄介面。點擊與滑鼠移入仍使用 `BlzTriggerRegisterFrameEvent`，事件中以 `Frame.fromEvent`、`Frame.getEventHandle` 讀取。

使用規則：

- w3ts `Frame` 只在 `src/shared/wc3-def/frame/` 的 WC3 實作中使用。features 只依賴 `FrameNatives` 介面，所以 Node 測試不需要 w3ts。
- 「框架規則」一節的同步規則仍適用：`Frame.fromName`、`Frame.fromOrigin` 不得第一次在 `GetLocalPlayer` 區塊內呼叫。

## TOC 與 FDF 樣板

使用者提議（2026-11-04）：設計專案自己的 TOC 檔案。以 FDF 定義物品欄的全部樣板，程式只建立樣板的實例。

### 檔案

| 檔案 | 地圖內路徑 | 內容 |
|---|---|---|
| `assets/ui/infinite-tower-rogue.toc` | `uiinfinite-tower-rogue.toc` | 列出本專案的全部 FDF |
| `assets/ui/inventory.fdf` | `uiinventory.fdf` | 物品欄樣板 |

- 建置時把 `assets/ui/` 複製到 `dist/<地圖>/ui/`，再封裝。原始地圖資料夾不放這些檔案。
- 遊戲開始後（共同流程）以 `Frame.loadTOC("ui\infinite-tower-rogue.toc")` 載入一次。傳回 false 時以 `logger.error` 輸出，物品欄不建立。
- TOC 每行一個 FDF 路徑，使用 CRLF。最後一行之後必須有空行；否則最後一個 FDF 可能不會載入（社群已知問題，I3 確認）。
- 之後的知識面板、說明框等新樣板，加入同一個 TOC，各自一個 FDF。

### 樣板（`inventory.fdf`）

全部名稱以 `Itr` 開頭，避免與內建樣板衝突。需要內建樣板時以 `IncludeFile` 引用後繼承。

| 樣板 | 類型 | 用途 |
|---|---|---|
| `ItrPanel` | `BACKDROP` | 面板背景與邊框（穿戴、背包、數值、說明） |
| `ItrSlotButton` | `GLUEBUTTON` | 物品格：圖示背景、滑鼠移入亮框、選取框、停用時的灰色圖示 |
| `ItrTabButton` | `GLUETEXTBUTTON` | 背包分頁按鈕 |
| `ItrActionButton` | `GLUETEXTBUTTON` | 丟棄、關閉等文字按鈕 |
| `ItrTitleText`、`ItrBodyText` | `TEXT` | 標題與內文字型、大小、顏色、對齊 |
| `ItrStatLine` | `FRAME`（兩個 `TEXT`） | 數值面板的一行：名稱靠左、數值靠右 |
| `ItrModelPreview` | `SPRITE` | 英雄模型預覽 |

- 格子大小、間距與面板尺寸以 FDF 為準。版面計算只決定位置（格子編號 → 行列 → 座標）。
- 圖示由程式以 `setTexture` 設定到樣板中的子框架。子框架以 `Frame.fromName(名稱, createContext)` 取得；`createContext` 使用格子編號。

### 驗證

- 產物測試：地圖中有 TOC 與 FDF；TOC 列出的每個 FDF 都存在；TOC 以空行結尾。
- I3 遊戲內實驗改為：`loadTOC` 傳回 true；每個樣板都能建立；文字有字型；SPRITE 能顯示英雄模型。

## 模組位置

| 位置 | 內容 |
|---|---|
| `src/shared/wc3-def/frame/`（新） | `FrameNatives` 介面與 WC3 實作。只包裝原生框架操作 |
| `src/shared/wc3-def/item/`（新或既有） | 原生物品操作：建立、隱藏、移動、使用者資料、拾取事件 |
| `src/features/save/` | 可變長度紀錄清單 |
| `src/features/equipment/model/` | 背包（90 格）狀態與規則：放入、取出、交換、第一個空格 |
| `src/features/equipment/ui/`（新） | 版面計算、檢視模型、點選狀態機。透過注入的介面讀取狀態與送出操作 |
| `src/features/equipment/config/` | 物品基底的圖示路徑與原生物品類型代碼 |
| `src/app/` | 組合：原生物品登錄表、拾取與丟棄、物品欄框架、存檔參與者 |
| `scripts/` | 建置時產生每個物品基底的原生物品類型 |

- 版面計算、檢視模型、點選狀態機與背包規則是純函式，可在 Node 測試。
- features 不 import app。英雄範例以介面注入。

## 待實驗（I3 前確認）

1. 本專案的 TOC 能載入，每個 FDF 樣板都能建立（見「TOC 與 FDF 樣板」）。
2. TOC 結尾沒有空行時，最後一個 FDF 是否載入失敗。
3. `SPRITE` 框架能否顯示英雄模型、播放站立動作，以及模型大小與位置。
4. 隱藏的原生物品是否會被其他單位撿起，或被範圍效果影響。（2026-11-04 已確認：目測不會。）
5. 選取英雄以外的單位時，面板是否保留或隱藏。

## 不包含

- 知識面板（另立設計稿）、拖放、物品堆疊、可使用的物品。
- 多名英雄（範例只有一名）。

## 階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| I1 | 存檔版本 4：可變長度紀錄清單、90 格背包、版本 3 轉換 | Node 與 Lua 測試；最壞情況的存檔碼可以存讀；既有存檔測試不變 |
| I2 | 原生物品載體：建置物品類型、登錄表、丟棄與撿起、背包規則 | Node 與 Lua 測試；建置成功 |
| I3 | 遊戲內實驗：待實驗 1～5 | 使用者確認結果 |
| I4 | 框架：版面、模型預覽、背包分頁、點選操作、說明面板、數值面板 | 建置成功；全部 Lua 驗證；`lint:fsd` 0 個問題 |
| I5 | 遊戲內驗證 | 使用者確認：開關、分頁、穿上、卸下、交換、丟棄、撿起、背包已滿、失敗原因、說明、數值更新、模型、焦點不殘留、存讀後相同 |
