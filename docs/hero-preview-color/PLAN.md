---
建立日期: 2026-11-04
是否完成: false
---

# 英雄預覽的顏色

## 目的

物品欄的英雄預覽（`SPRITE` 框架）顯示全黑剪影。本設計讓預覽顯示模型的顏色。

## 已知事實

| 事實 | 來源 |
|---|---|
| SPRITE 只從模型上方往下看，忽略模型中的鏡頭與光源 | 物品欄 I3，遊戲內確認（2026-11-04） |
| 包裝模型以附件 `Path` 載入的模型會顯示，輔助節點可以轉動它 | 物品欄 I3，遊戲內確認 |
| 一個預覽只建立一個 SPRITE。路徑使用 `.mdl` | 物品欄 I3、I5，遊戲內確認 |
| 使用者使用重製版（HD）圖形 | 使用者回答（2026-11-04） |
| 材質圖層沒有「不受光照」（Unshaded）旗標時，模型在框架中會變黑 | Hive Workshop 討論，未在本專案確認 |
| 遊戲內建模型不能在地圖中修改。只能把複本匯入地圖 | WC3 檔案規則 |

## 推測

- HD 模型使用 PBR 著色器，需要場景光源。SPRITE 沒有場景光源，所以全黑。
- 匯入地圖的模型檔不會被 HD 用戶端替換成 HD 版本。所以匯入 SD 模型的複本時，HD 用戶端也顯示 SD 模型。
- SD 模型加上「不受光照」旗標後，在 SPRITE 中應該顯示貼圖的顏色。

## 做法

1. 使用者從遊戲檔案匯出 SD 版的 `HeroArchMage.mdx`，放到 `assets/models/hero-archmage.mdx`（見「匯出教學」）。貼圖使用遊戲內建檔案，不需要匯出。
2. 建置腳本讀取此檔案，把每個材質圖層加上「不受光照」旗標（圖層旗標位元 `0x1`），輸出到 `dist/<地圖>/ui/itr-hero-archmage-unshaded.mdx`。原始檔案不修改。
3. 包裝模型的附件 `Path` 改為 `ui\itr-hero-archmage-unshaded.mdx`。程式中的預覽路徑不變。
4. `assets/models/` 中沒有模型檔時，建置沿用遊戲內建模型（剪影），並在建置記錄顯示警告。建置不失敗。

## 實驗（實作前）

| 編號 | 實驗 | 方式 | 結果的用途 |
|---|---|---|---|
| E1 | 圖形模式的影響 | 在遊戲設定切換為經典（SD）圖形，重新開圖，用 `-bag` 看預覽 | 若 SD 有顏色，原因是 HD 著色器，SD 複本的做法可行性高 |
| E2 | SD 複本，不改旗標 | 匯入 SD 複本，不加旗標，在 HD 圖形下看預覽 | 確認「HD 用戶端不替換匯入模型」與「是否還需要旗標」 |
| E3 | SD 複本，加上旗標 | 建置腳本加上旗標，在 HD 圖形下看預覽 | 確認最終做法 |
| E4 | 匯入貼圖（只在 E2、E3 的貼圖錯誤時） | 匯入 `hero-archmage.blp`，模型改用此路徑 | 避免 HD 用戶端換掉 SD 貼圖 |

E2 與 E3 使用暫時的建置選項切換，結果確認後只保留 E3 的做法（若 E2 已有顏色，則不加旗標）。

## 匯出結果（2026-11-04）

使用者電腦上有 1.27b（`D:\war3\launcher\127b\`），使用 MPQ。專案已安裝的 `mdx-m3-viewer-th` 可以讀取 MPQ，所以不需要 CASC 工具。

| 檔案 | 來源 | 大小 | SHA256 |
|---|---|---|---|
| `assets/models/hero-archmage.mdx` | `war3.mpq` 的 `Units\Human\HeroArchMage\HeroArchMage.mdx` | 182613 | `693d6a43…30baea` |
| `assets/models/hero-archmage.blp` | `war3.mpq` 的 `Units\Human\HeroArchMage\HeroArchmage.blp` | 144544 | `5f703a11…1c66eb` |

模型內容：

- 版本 800（SD）。10 個序列，3 個幾何，16 個附件點。
- 貼圖：`units\Human\HeroArchMage\HeroArchmage.blp`、隊伍顏色（可替換 1）、隊伍光暈（可替換 2）、`ReplaceableTextures\Weather\Clouds8x8.blp`、`Textures\Dust3x.blp`。
- 材質 0：1 個圖層，旗標 `0x0`。材質 1：2 個圖層，第 1 層已有 `0x1`。材質 2：1 個圖層，已有 `0x1`。所以主要的身體材質（材質 0、材質 1 第 2 層）沒有「不受光照」。

貼圖的風險：HD 用戶端可能把 `units\Human\HeroArchMage\HeroArchmage.blp` 換成 HD 貼圖。若 E2、E3 的顏色或貼圖錯誤，加入實驗 E4：把 `hero-archmage.blp` 匯入為 `ui\itr-hero-archmage.blp`，建置腳本同時把模型的貼圖路徑改成此路徑。

## 匯出教學（備用）

### 方法一：CascView（只匯出檔案）

1. 下載 CascView（Zezula 網站，`zezula.net/en/casc/main.html`）。
2. 開啟 CascView，選 `Open Storage`，選擇魔獸爭霸Ⅲ的安裝資料夾（例如 `C:\Program Files (x86)\Warcraft III`）。
3. 在左側找到 `war3.w3mod\units\human\heroarchmage\heroarchmage.mdx`。這是 SD 版。**不要**選 `_hd.w3mod` 底下的檔案。
4. 在檔案上按右鍵，選 `Extract`，存到專案的 `assets\models\`，改名為 `hero-archmage.mdx`。

### 方法二：Retera Model Studio（可以預覽模型）

1. 從 Hive Workshop 下載 Retera Model Studio。
2. 第一次啟動時，設定魔獸爭霸Ⅲ的安裝資料夾。
3. 選 `Open` → `Unit`（單位瀏覽器），找到「大魔法師」（Archmage）。
4. 確認畫面是 SD 版模型後，選 `File` → `Save As`，存成 `.mdx` 到 `assets\models\hero-archmage.mdx`。

## 測試（TDD，實作前由 Codex 撰寫）

- 建置腳本的旗標函式：每個圖層都有 `0x1`；其他旗標位元不變；圖層、貼圖與幾何資料數量不變。
- 包裝模型：附件 `Path` 指向不受光照的複本；沒有複本時指向遊戲內建模型。
- 地圖產物：有複本時，封裝中有 `ui\itr-hero-archmage-unshaded.mdx`，且每個圖層都有 `0x1`；包裝模型的附件路徑正確。
- 測試使用小型的假模型檔（由測試產生），不依賴使用者匯出的檔案。

## 不包含

- HD 模型的顏色（PBR 材質）。
- 其他英雄的模型（範例只有一名英雄）。
- 光影效果。不受光照的模型沒有明暗，看起來較平。

## 階段

| 階段 | 內容 | 完成條件 |
|---|---|---|
| P1 | 實驗 E1（不改程式） | 使用者回報 SD 圖形下預覽是否有顏色 |
| P2 | 模型已匯出（見「匯出結果」）；Codex 撰寫測試；使用者實作建置腳本與 E2/E3 切換 | 測試通過；建置成功 |
| P3 | 遊戲內實驗 E2、E3 | 使用者確認 HD 圖形下預覽有顏色 |
| P4 | 移除暫時切換，保留最終做法；更新 skill | 測試通過；遊戲內確認 |
