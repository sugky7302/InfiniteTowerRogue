---
建立日期: 2026-11-04
是否完成: false
---

# 英雄預覽的顏色：任務

規格：`PLAN.md`。每個任務依 `AGENTS.md` 的開發流程進行：Codex 先寫測試，使用者實作，Codex 驗證。

## 介面約定

全部建置函式放在新檔案 `scripts/preview-model.cjs`（CommonJS，與 `scripts/ui-models.cjs` 相同）。使用 `mdx-m3-viewer-th` 的 `parsers.mdlx.Model`。

| 函式 | 輸入 | 輸出 |
|---|---|---|
| `stripEffects(model)` | `Model` | 同一個 `Model`（原地修改）。移除粒子、緞帶發射器與事件物件 |
| `makeUnshaded(model)` | `Model` | 同一個 `Model`（原地修改）。每個材質圖層加上旗標 `0x1` |
| `stripTeamGlow(model)` | `Model` | 同一個 `Model`（原地修改）。移除隊伍光暈幾何（T7） |
| `buildPreviewHero(bytes, options)` | 原始 MDX 位元組；`{ unshaded: boolean }` | 新的 MDX 位元組（`Uint8Array`）。不修改輸入 |

## T1：移除效果節點（`stripEffects`）

- 移除 `particleEmitters`、`particleEmitters2`、`particleEmittersPopcorn`、`ribbonEmitters`、`eventObjects`。
- 其他節點（骨骼、輔助節點、附件點、光源、碰撞形狀）保留，順序不變。
- 節點編號（`objectId`）重新編號為連續的 0、1、2……；每個節點的 `parentId` 改為新編號；父節點被移除時改為 `-1`。
- `pivotPoints` 依新編號重新排列，長度等於節點數量。
- 幾何的骨骼矩陣群組（`matrixGroups`／`matrixIndices`）指向的骨骼編號改為新編號。
- 找不到對應的矩陣編號時丟出錯誤，訊息包含幾何索引、項目索引與舊編號；丟出錯誤時模型不變。
- 幾何、材質、貼圖、序列、全域序列的數量不變。

完成條件：測試通過；用 `assets/models/hero-archmage.mdx` 執行時，效果節點為 0，其他數量不變。

## T2：不受光照（`makeUnshaded`）

- 每個材質的每個圖層：`flags |= 0x1`。其他旗標位元不變。
- 圖層數量、`filterMode`、`textureId`、`alpha` 不變。

完成條件：測試通過。

## T3：建置複本（`buildPreviewHero` 與建置流程）

- `buildPreviewHero`：讀取位元組 → `stripEffects` → 若 `unshaded` 為 true 則 `makeUnshaded` → 輸出 MDX。輸入的位元組不改變。
- `scripts/ui-models.cjs` 的 `writePreviewModels`：
  - `assets/models/hero-archmage.mdx` 存在時，輸出 `ui/itr-hero-archmage-unshaded.mdx`，包裝模型的附件 `Path` 為 `ui\itr-hero-archmage-unshaded.mdx`。
  - 檔案不存在時，附件 `Path` 使用遊戲內建 `units\human\HeroArchMage\HeroArchMage.mdx`，並以建置記錄顯示警告。建置不失敗。
- 暫時的實驗切換：環境變數 `ITR_PREVIEW_UNSHADED`。值為 `0` 時 `unshaded: false`（E2），其他值或未設定時為 `true`（E3）。
- 為了測試，`writePreviewModels` 的介面改為 `writePreviewModels(uiFolder, heroModel, options = {})`：

  | 選項 | 預設值 | 用途 |
  |---|---|---|
  | `source` | `assets/models/hero-archmage.mdx`（相對於目前工作資料夾） | 複本的來源檔案 |
  | `unshaded` | `process.env.ITR_PREVIEW_UNSHADED !== "0"` | 是否呼叫 `makeUnshaded` |
  | `warn` | `console.warn` | 沒有來源檔案時輸出警告的函式 |

  - 回傳包裝模型實際使用的附件路徑（字串）。
  - `scripts/utils.ts` 的呼叫方式不變（只傳前兩個參數）。
  - 來源檔案存在但無法解析時，丟出錯誤（建置失敗），不得改用遊戲內建模型。

完成條件：測試通過；`npm run build` 成功；`npm run test:ui:artifact` 通過。

## T4：地圖產物檢查

- 有複本時：封裝中有 `ui\itr-hero-archmage-unshaded.mdx`；效果節點為 0；未設定 `ITR_PREVIEW_UNSHADED` 時每個圖層都有 `0x1`；包裝模型的附件 `Path` 指向它。
- 沒有複本時：封裝中沒有該檔案；附件 `Path` 是遊戲內建模型。

完成條件：`npm run test:ui:artifact` 通過。

## T5：遊戲內實驗 E2、E3（使用者）

| 實驗 | 建置 | 檢查 |
|---|---|---|
| E2 | `ITR_PREVIEW_UNSHADED=0` | HD 與 SD 圖形下各打開物品欄，等待 10 秒以上：是否有顏色、畫面是否變白 |
| E3 | 不設定 | 同上 |

若貼圖錯誤，進行 `PLAN.md` 的 E4。

結果（2026-11-05）：HD 只有 E3 有顏色；SD 兩者都有顏色；畫面不變白。四種情況都有白色菱形（隊伍光暈幾何），加入 T7。不需要 E4。

## T7：移除隊伍光暈幾何（`stripTeamGlow`）

在 T6 之前進行。

- 隊伍光暈幾何的定義：幾何的 `materialId` 指向的材質，**全部**圖層的 `textureId` 都指向 `replaceableId` 為 2 的貼圖。材質沒有圖層時，不算隊伍光暈幾何。
- 移除全部隊伍光暈幾何。其他幾何保留，順序不變。
- 幾何動畫（`geosetAnimations`）：
  - `geosetId` 指向被移除幾何的幾何動畫，一起移除。
  - 其他幾何動畫的 `geosetId` 改為新的幾何編號。
- 骨骼（`bones`）：
  - `geosetId` 指向被移除的幾何時改為 `-1`；指向保留的幾何時改為新編號；原本是 `-1` 時不變。
  - `geosetAnimationId` 依相同規則對應新的幾何動畫編號。
- 材質、貼圖、節點、pivot、序列不變。
- 沒有隊伍光暈幾何時，模型不變。
- `buildPreviewHero` 在 `stripEffects` 之後呼叫 `stripTeamGlow`，再依 `unshaded` 呼叫 `makeUnshaded`。

完成條件：測試通過；用 `assets/models/hero-archmage.mdx` 執行時，幾何由 3 個變為 2 個，骨骼 `hero` 與 `Plane01` 的 `geosetId` 變為 `-1`；`npm run build` 與 `npm run test:ui:artifact` 通過；遊戲內沒有白色菱形。

## T6：收尾

- 依 E2、E3 的結果移除 `ITR_PREVIEW_UNSHADED`，只保留最終做法。
- 更新 `PLAN.md`（結果、是否完成）與 `wc3-def` skill。

## 進度

| 任務 | 測試 | 實作 | 驗證 |
|---|---|---|---|
| T1 | 完成 | 完成 | 完成 |
| T2 | 完成 | 完成 | 完成 |
| T3 | 完成 | 完成 | 完成 |
| T4 | 完成 | 不需要（T3 已產生產物） | 完成 |
| T5 | — | — | 完成 |
| T7 | 完成 | 完成 | 程式完成；遊戲內待確認 |
| T6 | — | 未開始 | 未開始 |
