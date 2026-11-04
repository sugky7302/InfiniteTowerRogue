---
建立日期: 2026-11-04
是否完成: false
---

# I4 正式物品欄框架

唯一規格為 `../PLAN.md`。遵守 `../i3/PLAN.md` 的最終結論。I5 須由使用者在遊戲中驗證。本次不啟動遊戲。

## 檔案與做法

- `src/features/equipment/ui/`：純版面計算、檢視模型、點選狀態機與注入介面。不依賴 app 或原生框架。
- `src/features/equipment/config/`：內建圖示、空格圖示及穿戴位置圖示。
- `src/app/inventory-ui.ts`：共同流程建立框架、登錄同步事件、檢查擁有者、連接狀態機。只以本地玩家控制可見性。
- `src/app/hero-example.ts`：提供變更訂閱與操作入口。聊天、拾取、讀檔、升級及面板操作皆通知，不輪詢。
- `assets/ui/inventory.fdf`：尺寸、文字與新增面板樣板。主 TOC 保持 CRLF 及結尾空行。
- `scripts/ui-models.cjs`：只產生 16 個角度，移除反向實驗模型。
- `tests/ui/`：Node 與 Lua 共用純函式案例、假原生整合案例、主 TOC／樣板／預覽模型產物檢查。
- 移除 I3 實驗程式、聊天指令、探測資源與專用測試。更新既有 `hero-item-attributes`、`wc3-def` 技能，不建立新技能。

## 版面座標

座標以左下角為原點。全部面板位於 4:3 區域。主面板下緣為 y＝0.18。開關下緣為 y＝0.165，放在原生物品欄上方。

| 區域 | 左下角 | 寬 × 高 |
|---|---|---|
| 英雄與穿戴 | 0.02, 0.30 | 0.20 × 0.28 |
| 二級數值 | 0.225, 0.30 | 0.21 × 0.28 |
| 背包 | 0.44, 0.30 | 0.34 × 0.28 |
| 說明與操作結果 | 0.02, 0.18 | 0.60 × 0.115 |
| 原生物品欄旁開關 | 0.625, 0.165 | 0.09 × 0.028 |

背包格子寬高 0.04，間隔 0.009。第一格左上角為 0.46, 0.54。每頁 6 欄、5 行。頁數為 floor(格子編號 / 30)，行為 floor((編號 % 30) / 6)，列為編號 % 6。內部編號 0～89；聊天編號 1～90。

預覽原點為英雄面板內 0.10, 0.075，縮放 0.001。每次顯示或旋轉建立新 SPRITE，舊框架隱藏；模型使用 `.mdl` 路徑。全部建立及名稱查詢都在共同流程。

## 與設計稿的差異

- 說明面板置於三個主面板下方，右側保留開關空間。內文寬 0.576，以容納固定屬性、詞綴、差值與全部失敗原因。主設計稿沒有指定其座標。
- 英雄預覽接受剪影。這是 I3 已確認且本次允許的引擎限制。
- 卸下使用第一個空格，沿用 I2；點擊的背包格只表示卸下操作的目的區域。

## I5 遊戲內驗證步驟

1. 手動載入本次 `dist/bin/map.w3x`。以 `-bag`、原生物品欄旁按鈕、關閉按鈕驗證開關。選取其他單位，確認面板保持可見。
2. 建立至少 31 件物品。切換三個頁籤，確認每頁 6×5 格、位置不重複、選取可跨頁操作。
3. 點背包物品再點正確穿戴位置。確認穿上與舊裝備回到背包。點同一格可取消；沒有選取時點空格沒有動作。
4. 點穿戴物再點背包，確認卸下。背包內點兩格，確認交換，包含空格與跨頁交換。
5. 選背包物品後丟棄，確認英雄腳下出現載體。撿回後確認第一個空格更新。沒有選取或選穿戴物時丟棄，確認原因。
6. 填滿 90 格。卸下須失敗且狀態不變；地面物品撿起後仍在地面。清出一格再撿起。滿背包替換裝備仍可使用候選物清出的空格。
7. 先以 `-save` 保存知識。建立術式手冊，執行 `-hero-forget` 後，把手冊點到工具格，確認同時顯示位置錯誤及缺少知識。讀檔恢復。穿上術式手冊後嘗試穿上巡檢長槌，再反向測試雙手武器占用副手。確認失敗時資料不變。
8. 移入每種物品與空格，確認名稱、階級、固定屬性、詞綴及同位置裝備差值。穿戴物不顯示候選差值。確認零差值顯示「無」。
9. 比對 `-hero` 與數值面板。百分比須有 `%`。穿上、卸下、`-hero-up`、聊天交換、`-item-new`、丟棄、撿起與讀檔後確認立即更新。
10. 每次開啟確認正面剪影可見。左右旋轉各 16 次，確認循環、方向及舊模型沒有重疊。
11. 點格子、頁籤、丟棄、旋轉、關閉與開關後按空白鍵及 Enter，確認沒有重複操作。確認指令卡、原生物品欄仍可用。
12. `-save`，記錄三頁格序、穿戴與數值。變更後 `-load`，確認資料相同；重新開圖讀檔再比對。確認選取不指向舊物品。
13. 多人時由非擁有者嘗試點選與 `-bag`。確認不能操作擁有者的物品，且全部用戶端的遊戲狀態一致。

## 驗證結果

I5 尚未執行，主設計稿及本設計稿保持 `false`。

2026-11-04 最終自動驗證：

| 指令 | 結果 |
|---|---|
| `npm run test:unit` | 903 組通過，0 組失敗；含 I4 的 28 組共用案例、1 組 Node float32 案例、8 組框架整合案例 |
| `npm run format:check` | 通過 |
| Prettier `--debug-check` | 本次 13 個程式與測試檔通過 |
| `npm run lint:fsd` | 0 個問題，未新增豁免 |
| `npm run build` | 通過；`dist/bin/map.w3x` 未被占用 |
| `npm run test:save:lua` | 15 組通過 |
| `npm run test:skill:lua` | 16 組通過 |
| `npm run test:i18n:lua` | 多語言 11 組、本地檔案 33 組通過 |
| `npm run test:benchmark:lua` | 18 組通過 |
| `npm run test:combat:lua` | 113 組通過 |
| `npm run test:hero:lua` | 152 組通過；含 I4 的 28 組共用案例 |
| `npm run test:skill:artifact` | 5 組通過 |
| `npm run test:benchmark:artifact` | 4 組通過 |
| `npm run test:i18n:artifact` | 8 組通過 |
| `npm run test:save:artifact` | 12 組通過 |
| `npm run test:hero:artifact` | 6 組通過 |
| `npm run test:combat:artifact` | 7 組通過 |
| `npm run test:ui:artifact` | 8 組通過 |

Lua 合計 358 組，地圖產物合計 50 組，全部為 0 組失敗。英雄 Lua 驗證移除 `debug` 後執行。產物檢查確認主 TOC 結尾空行、全部樣板、16 個預覽模型、實驗資源移除，以及封裝腳本和建置腳本一致。`war3map.lua` 沒有 `2 ^ 1024`。

最終地圖：`dist/bin/map.w3x`。SHA256：`07215DB01CDF2E476FE2DDA043A48D109446CB7B2ECD52D95641360ADE604CCB`。

未執行 `npm run test`，未啟動遊戲，未提交 Git。I5 的實際排版、說明是否完整顯示、模型位置、旋轉、焦點與多人同步仍須在遊戲中驗證。全黑剪影是已接受的 I3 限制。

## 檔案清單

| 狀態 | 檔案 |
|---|---|
| 新增 | `docs/inventory-ui/i4/PLAN.md` |
| 新增 | `src/app/inventory-ui.ts` |
| 新增 | `src/features/equipment/config/inventory-icons.ts` |
| 新增 | `src/features/equipment/ui/layout.ts`、`interaction.ts`、`text.ts`、`view.ts` |
| 新增 | `tests/ui/cases.ts`、`inventory.spec.ts`、`frames.spec.ts` |
| 修改 | `.gitattributes` |
| 修改 | `.github/skills/hero-item-attributes/SKILL.md`、`.github/skills/wc3-def/SKILL.md` |
| 修改 | `assets/ui/inventory.fdf` |
| 修改 | `scripts/ui-models.cjs`、`scripts/utils.ts` |
| 修改 | `src/app/hero-example.ts`、`src/app/skill-example.ts`、`src/main.ts` |
| 修改 | `src/features/equipment/index.ts` |
| 修改 | `tests/hero/lua-entry.ts`、`tests/run.ts`、`tests/ui/artifact.spec.ts` |
| 刪除 | `src/app/ui-experiment.ts`、`tests/ui/experiment.spec.ts` |
| 刪除 | `assets/ui/itr-probe-no-trailing.toc`、`assets/ui/itr-probe.fdf` |

共新增 10 個檔案、修改 13 個檔案、刪除 4 個檔案。既有 `src/app/native-item-registry.ts` 與 `src/shared/wc3-def/frame/` 的介面已足夠，本次沿用。主 TOC 未改動。`itr-hero-preview-inv.mdx` 是舊建置產物；清理建置後不再產生。

原有未追蹤的 `.claude/`、`docs/inventory-ui/.gitignore`、`docs/other-maps-concept/` 未修改。

## 實作補充

- `HeroExample` 實作 `InventoryPort`，並提供可取消的變更訂閱。面板停止時清理訂閱、0 秒啟動計時器、觸發器與兩個根框架。
- 點選狀態機在 app 執行載體丟棄前先算出新資料。載體成功丟棄後才提交資料。載體失敗時保留物品、選取及原資料。
- 外部變更會清除選取並更新當前頁、移入說明及數值。顯示更新失敗只用 `logger.error` 回報，不中斷已完成的物品變更。
- 數值文字以整數部分與一位小數組合。只將小數部分乘以 10，避免整數中間值超過 int32。Node 與 Lua 共用接近上限的格式案例。Node 另以 `Math.fround` 檢查座標及二級數值。
- 內建物品資料表可確認符文杖、長槌、手冊與長袍的圖示。短劍沿用 I3 已顯示的 `BTNSteelMelee.blp`。空穿戴位置使用相應的內建停用圖示。

## 聊天指令

目前啟動的範例支援以下指令。I3 的 `-ui-*` 指令全部移除。

- 物品欄：`-bag`。
- 英雄：`-hero`、`-hero-up`、`-hero-forget`。
- 物品：`-item-new <基底>`、`-items`、`-equip <編號>`、`-unequip <位置>`、`-drop <格子>`、`-bag-swap <格子> <格子>`。
- 戰鬥：`-pause`、`-resume`、`-skill-status`、`-skill-move`、`-combat-hold`、`-revive`、`-skill-stop`。
- 存讀：`-save`、`-load`、`-load <存檔碼>`、`-load <段號>/<總段數> <片段>`。
- 存檔除錯：`-save-demo show`、`-save-demo level <1～100>`、`-save-demo gold <0～1000000>`、`-save-demo item <1～6> <目錄編號>`。
- 語言：`-lang`、`-lang zh-TW`、`-lang zh-CN`、`-lang en-US`。

基底接受符文杖、訓練短劍、巡檢長槌、術式手冊、學徒長袍，或對應的基底 ID。穿戴位置接受主武器、副手、防具、工具，或對應的位置 ID。背包聊天格子為 1～90，穿戴使用 `-items` 顯示的物品編號。

## I5 第 1 輪結果（2026-11-04）

使用者在遊戲中確認：開關（按鈕與 `-bag`）、每頁 30 格、穿上、卸下、丟棄、背包已滿、失敗原因、說明、數值更新、模型、焦點都正確。

- 存讀檔後關閉遊戲時卡住。推測原因：每次開啟面板與每次旋轉都建立新的 SPRITE（英雄模型），框架數量不斷增加。
- 使用者決定移除旋轉功能。修改：英雄預覽只顯示正面，只建立一個 SPRITE；移除左轉與右轉按鈕及 `ItrTurnButton` 樣板；建置只產生 `uiitr-hero-preview.mdx`。
