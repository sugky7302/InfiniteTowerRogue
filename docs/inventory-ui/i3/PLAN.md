---
建立日期: 2026-11-04
是否完成: false
---

# I3 框架實驗

## 範圍與檔案

- 唯一規格：`docs/inventory-ui/PLAN.md`。本階段只提供實驗工具，不實作物品欄規則。
- `assets/ui/`：主 TOC、物品欄 FDF、無結尾空行的探測 TOC、探測 FDF。
- `src/shared/wc3-def/frame/`：`FrameNatives` 與 w3ts `Frame` 實作；從既有公開 API 匯出。
- `src/app/ui-experiment.ts`：樣板、事件、模型與選取觀察。`src/main.ts` 傳入既有英雄範例。
- `scripts/utils.ts`：將 UI 資源複製到建置地圖。`tests/ui/artifact.spec.ts`：檢查封裝內容。
- `tests/ui/experiment.spec.ts`：以假原生介面檢查兩個用戶端的建立順序、聊天、事件、零值參數、選取觀察與清理。由 `tests/run.ts` 執行。
- `.gitattributes`：主 TOC 固定 CRLF；探測 TOC 保留原始位元組。
- 更新 `.github/skills/wc3-def/SKILL.md`，不建立新技能。

## 做法

- 用一次性 0 秒計時器延後啟動。全部玩家在共同流程載入兩個 TOC，各一次。
- 框架建立與名稱、原點查詢都在共同流程執行。聊天事件收到指令後，全部玩家執行相同建立流程。
- 只有可見性按本地玩家切換。訊息只送給指令或事件的玩家。
- FDF 保存尺寸、字型、對齊與外觀；程式設定位置、內容與模型。
- 建立失敗傳回 `undefined`。錯誤使用 `logger.error`。停止時銷毀觸發器、計時器與根框架；子框架由父框架清除。
- 選取觀察使用獨立 10 秒計時器。不依賴可暫停的世界時鐘。不根據本地可見值改變遊戲狀態。

## FDF 的不確定項目

- 不繼承未確認的遊戲樣板，也不引用未確認的內建 FDF。自行定義背景、邊框、按鈕狀態與字型。
- `MasterFont` 的中文呈現、按鈕狀態材質、SPRITE 的模型大小、相機與動作須在遊戲確認。
- 全部文字框架設定 `DecorateFileNames`，以解析 `MasterFont` 字型鍵。此做法參考 [FDF 教學](https://www.hiveworkshop.com/threads/ui-reading-a-fdf.315850/)，不依賴內建文字樣板繼承此屬性。
- w3ts 只提供 `setSpriteAnimate(primaryProp, flags)`，不提供按名稱播放。指令會把支援的名稱轉成原生主要動作屬性並回報數值。
- [SPRITE 實驗記錄](https://www.hiveworkshop.com/pastebin/b13e7da43793ff34065ff0cc91836f51.36568) 列出 birth＝0、death＝1、stand＝2、morph＝3、alternate＝4。這些值不是 `ANIM_TYPE_*` 的 handle 編號。沒有已知的 attack 屬性；輸入 attack 時說明限制，不假稱已播放。其餘屬性是否適用英雄模型，仍須觀察。
- [框架教學的模型範例](https://www.hiveworkshop.com/threads/the-big-ui-frame-tutorial.335296/) 說明世界模型需要很小的縮放。本實驗初始值為 0.001。`-ui-model` 接受 x＝-0.8～0.8、y＝-0.6～0.6、0＜scale≤5，包含 0 座標。
- 按鈕狀態欄位參考 [Tasyen 的 GLUEBUTTON 實驗](https://www.hiveworkshop.com/threads/ui-gluebutton.318621/)。格子有獨立圖示、停用圖示、移入亮框與選取框。選取框初始隱藏。
- 無結尾空行 TOC 的傳回值與樣板建立結果分別記錄；不以傳回值推定載入成功。

## 建置與驗證

- 將 `assets/ui/` 複製到 `dist/<mapFolder>/ui/`，再沿用 MPQ 封裝。不得寫入 `maps/`。
- 主 TOC 使用 CRLF，內容為 `ui\inventory.fdf`，之後留空行。探測 TOC 只有 `ui\itr-probe.fdf`，結尾沒有換行。
- 產物測試比對來源、建置資料夾與 MPQ 位元組；檢查 TOC 路徑、換行、八個主樣板與探測樣板。
- 執行使用者指定的單元、格式、分層、建置、六組 Lua 與全部產物測試。不執行 `npm run test`。

## 給使用者的遊戲內實驗步驟

1. 載入本次 `dist/bin/map.w3x`，等啟動訊息出現。
2. 待實驗 1：輸入 `-ui-toc`，再輸入 `-ui-show`。記錄主 TOC 傳回值與每個樣板結果。確認背景、三格圖示、兩個文字按鈕、中文與英文、兩行左右對齊數值。回報缺少或位置錯誤的項目。移入三格，確認編號；點擊五個按鈕，確認名稱；點擊後按空白鍵與 Enter，確認沒有再次點擊。
3. 待實驗 2：在同一次啟動的 `-ui-toc` 訊息中，記錄探測 TOC 傳回值與 `ItrProbeText` 建立結果。探測 FDF 不得加入主 TOC。重新開圖才會重新載入。
4. 待實驗 3：輸入 `-ui-show`。確認英雄模型與站立動作。用 `-ui-model 0.28 0.08 0.0008` 調整，再依顯示結果改 x、y、scale。輸入 `-ui-anim death`、`-ui-anim stand`。也可輸入 `-ui-anim attack` 確認限制訊息。回報是否顯示、動作是否改變、可用座標與縮放。座標相對面板左下角。
5. 待實驗 5：保持面板顯示，輸入 `-ui-select`。在 10 秒內依序選取英雄、其他單位、英雄。記錄選取訊息與面板可見結果，並以畫面確認。程式不會自動隱藏面板。
6. 輸入 `-ui-hide` 確認隱藏，再用 `-ui-show` 確認可重新顯示。實驗結束時輸入 `-ui-stop` 清理資源。

`-ui-stop` 會在共同流程停止整個實驗，影響全部玩家。要重新測試時，重新載入地圖。其他指令的訊息只顯示給輸入者；模型位置與動畫設定在共同流程更新，面板開關各自獨立。

## 驗收狀態

遊戲內結果由使用者回報。在收到結果前，本設計稿及主設計稿的「是否完成」維持 `false`。

2026-11-04 自動驗證結果：

| 指令 | 結果 |
|---|---|
| `npm run test:unit` | 870 組通過，0 組失敗；含 I3 新增 4 組 |
| `npm run format:check` | 通過 |
| `npm run lint:fsd` | 0 個問題，未加豁免 |
| `npm run build` | 通過；封裝未被占用 |
| `npm run test:save:lua` | 15 組通過 |
| `npm run test:skill:lua` | 16 組通過 |
| `npm run test:i18n:lua` | 多語言 11 組、本地檔案 33 組通過 |
| `npm run test:benchmark:lua` | 18 組通過 |
| `npm run test:combat:lua` | 113 組通過 |
| `npm run test:hero:lua` | 124 組通過 |
| `npm run test:save:artifact` | 12 組通過 |
| `npm run test:skill:artifact` | 5 組通過 |
| `npm run test:i18n:artifact` | 8 組通過 |
| `npm run test:benchmark:artifact` | 4 組通過 |
| `npm run test:combat:artifact` | 7 組通過 |
| `npm run test:hero:artifact` | 6 組通過 |
| `npm run test:ui:artifact` | 8 組通過 |

Lua 共 330 組通過。地圖產物共 50 組通過。所有檢查均為 0 組失敗。封裝腳本與建置腳本一致，`war3map.lua` 沒有 `2 ^ 1024`。

最終封裝：`dist/bin/map.w3x`。SHA256：`6CE4CFC5B52D8E45C792E8B1D04EF2E9766DC67B6AF72A077EF47F47ACECA5B2`。

未啟動遊戲、未執行 `npm run test`、未提交 Git。待實驗 1、2、3、5 的引擎結果仍未驗證；假原生介面與產物檢查不能證明 FDF 可解析、模型可見、焦點清除或多人遊戲不會失去同步。

## 遊戲內結果（2026-11-04，第 1 輪）

| 待實驗 | 結果 |
|---|---|
| 1. 主 TOC 與樣板 | `loadTOC` 傳回 true。全部樣板建立成功。中文與英文字型正常。格子的滑鼠移入亮框與移入、移出事件正常 |
| 2. TOC 結尾沒有空行 | 探測 TOC 傳回 false，`ItrProbeText` 建立失敗。**TOC 必須以空行結尾** |
| 3. SPRITE 模型 | 模型可以顯示，`setSpriteAnimate` 可以切換死亡與站立動作，縮放有效。問題：模型全黑；模型在面板左下角之外 |
| 5. 選取其他單位 | 選取其他單位時，面板保持可見。程式需要自己決定是否隱藏 |

原因與修正：

- 位置：`setScale` 也縮放框架的位移。0.34 × 0.001 幾乎等於 0，所以模型停在面板左下角。修正為位移除以縮放。
- 全黑：推測 SPRITE 沒有場景光源。新增 `-ui-file <模型路徑> [鏡頭]`，比較頭像模型與其他單位模型。

## 第 2 輪實驗步驟

1. `-ui-show`。確認模型在面板內（預設位置 0.34、0.06）。
2. `-ui-model 0.34 0.06 0.0008` 等數值，找出合適的位置與縮放。
3. `-ui-file units\human\HeroArchMage\HeroArchMage_portrait.mdx`：頭像模型是否有顏色。
4. `-ui-file units\human\Footman\Footman.mdx`：一般單位模型是否也全黑。
5. 回報每一項是否有顏色。
