---
建立日期: 2026-11-04
是否完成: false
---

# 物品欄介面（首版）

## 目的

- 以自訂框架（frame）建立物品欄：穿戴位置、持有清單格子、數值面板。
- 取代聊天指令 `-items`、`-equip`、`-unequip` 的日常操作。聊天指令保留，供測試使用。

## 參考

使用者提供的參考畫面有四個面板：天賦、穿戴位置（含英雄模型）、數值清單、6×5 背包格子。

| 來源 | 採用的做法 |
|---|---|
| [TasItemBag](https://www.hiveworkshop.com/threads/tasitembag.338469)（Tasyen） | 背包是按鈕格子，每格最多一件物品；以物品欄旁的按鈕開關；每名英雄一個背包 |
| [Inventory & Equipment UI System](https://www.hiveworkshop.com/threads/inventory-equipment-ui-system-v1-4-3.291826/latest) | 穿戴位置與背包分開；工具提示另成模組 |
| [The Big UI-Frame Tutorial](https://www.hiveworkshop.com/pastebin/913bd439799b3d917e5b522dd9ef458f20598/) | 框架規則與陷阱（見下節） |
| [UI: EditBox](https://www.hiveworkshop.com/threads/ui-editbox-text-input.316239/)、[Frames & Multiplayer](https://xgm.guru/p/wc3/Frames--Multiplayer-3kU) | 本地輸入以同步事件送出，再改變同步狀態 |

## 框架規則（來自參考）

1. 框架在遊戲時間 0 秒後建立，不在地圖初始化建立。
2. 全部玩家建立相同的框架。只用 `GetLocalPlayer` 控制可見性（`BlzFrameSetVisible`）。
3. `BlzGetFrameByName`、`BlzGetOriginFrame` 不得第一次在 `GetLocalPlayer` 區塊內呼叫，否則可能不同步。先存到變數。
4. 框架事件（`BlzTriggerRegisterFrameEvent`）是同步的，事件值可以安全使用。`BlzFrameGetText`、`BlzFrameIsVisible` 是本地值，不得用於改變遊戲狀態。
5. 點擊後按鈕保留鍵盤焦點，空白鍵或 Enter 會再點一次。處理方式：點擊後 `BlzFrameSetEnable(false)` 再 `true`。
6. 座標範圍 0～0.8 × 0～0.6（4:3 區域）。重新定位前先 `BlzFrameClearAllPoints`。
7. 圖示使用 `BACKDROP` 放在 `BUTTON` 內，`BlzFrameSetAllPoints` 對齊，`BlzFrameSetTexture(frame, path, 0, true)`。
8. 工具提示（`BlzFrameSetTooltip`）只在本地顯示。

## 決策（預設值，可由使用者修改）

| 問題 | 決策 | 原因 |
|---|---|---|
| 首版面板 | 穿戴位置、持有清單、數值面板 | 天賦系統不存在；英雄模型需要額外實驗 |
| 穿戴位置 | 4 格：主武器、副手、防具、工具 | 沿用現有規則 |
| 持有清單 | 12 格（6×2） | 與存檔格式一致。增加格數須同時改存檔版本 |
| 操作 | 左鍵點持有物＝比較後穿上；左鍵點穿戴物＝卸下 | 框架沒有原生拖放；點擊事件同步且可靠 |
| 失敗 | 不改變狀態，以浮動文字或訊息顯示全部原因 | 沿用穿戴規則 |
| 開關 | 物品欄旁一個按鈕，以及聊天指令 `-bag` | 參考 TasItemBag |
| 工具提示 | 名稱、階級、固定屬性、詞綴；持有物另顯示與同位置裝備的差值 | 沿用 `compareEquipment` |
| 數值面板 | `-hero` 的二級數值清單，百分比以「%」顯示 | 修正已知限制「百分比以小數顯示」 |
| 原生物品欄 | 不變動 | 目前不使用原生物品 |

## 模組位置

| 位置 | 內容 |
|---|---|
| `src/shared/wc3-def/frame/`（新） | `FrameNatives` 介面與 WC3 實作。只包裝原生框架操作 |
| `src/features/equipment/ui/`（新） | 物品欄的版面計算、檢視模型、事件處理。透過注入的介面讀取狀態與送出操作 |
| `src/features/equipment/config/` | 物品基底圖示路徑（顯示資料） |
| `src/app/` | 組合：把 `HeroExample` 的狀態與穿脫操作接到物品欄 |

- 版面計算與檢視模型是純函式，可在 Node 測試。
- features 不 import app。`HeroExample` 以介面（讀取快照、穿上、卸下）注入。

## 待實驗（U2 前確認）

1. 以 `BlzCreateFrameByType` 建立 `TEXT` 時，不載入 TOC 是否有字型。若沒有，建置時加入 TOC 與 FDF 樣板。
2. 工具提示框的背景樣板（例如 `EscMenuControlBackdropTemplate`）是否需要載入 TOC。
3. 選取英雄以外的單位時，面板是否保留或隱藏。

## 不包含

- 天賦面板、英雄模型預覽、拖放、背包分頁、物品堆疊。
- 多名英雄（範例只有一名）。

## 階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| U1 | `FrameNatives`、純版面計算、檢視模型 | Node 測試；`lint:fsd` 0 個問題 |
| U2 | 待實驗項目；建立框架、點擊與工具提示、app 接線 | 建置成功；Lua 驗證通過 |
| U3 | 遊戲內驗證 | 使用者確認：開關、穿上、卸下、失敗原因、工具提示、數值更新、焦點不殘留 |
