# 無盡高塔地圖

## 編輯與測試

- 使用 World Editor 編輯 `maps/map.w3x`。這是原始地圖資料夾。
- 使用文字編輯器修改 `src/` 中的 TypeScript 程式。
- 執行 `pnpm run build`，產生 `dist/bin/map.w3x` 封裝地圖。
- 執行 `pnpm run test`，重新編譯、封裝並啟動測試地圖。
- 遊戲設定在 `config.json`。`gameExecutable` 必須指向遊戲執行檔。測試參數包含 `-launch` 與 `-editor`。
- 測試前請先關閉已開啟的遊戲。測試指令不會強制終止遊戲。
- 若清理時出現檔案占用訊息，請關閉遊戲，以及開啟 `dist/` 內地圖的編輯器，再重新測試。清理流程會保留 `dist/` 根目錄。

`dist/tstl_output.lua` 是編譯中間產物。建置流程會將它合併到 `dist/map.w3x/war3map.lua`，再封裝成地圖。

觸發編輯器讀取自己的觸發器資料。建置流程不會將 TypeScript 產物寫入觸發器資料，因此觸發編輯器不會顯示這些程式。請在 `src/` 修改程式。

請勿使用 World Editor 儲存 `dist/` 中的建置產物。編輯器可能重新產生地圖腳本。原始地圖存檔後，請重新執行建置或測試。

## 編輯器全域變數

在 World Editor 中放置的單位、觸發器和區域，會在 `maps/map.w3x/war3map.lua` 產生以 `gg_` 開頭的全域變數，例如 `gg_unit_Hpal_0002` 和 `gg_trg_Initialization`。

`src/war3map.d.ts` 為這些變數宣告型別，讓 TypeScript 程式可以直接使用它們。這個檔案只提供型別，不會產生 Lua 程式碼。

- 執行 `pnpm run build:defs`，從 `war3map.lua` 重新產生 `src/war3map.d.ts`。
- 執行 `pnpm run dev`，監看 `maps/` 中的 `.lua` 檔，並在地圖存檔後自動重新產生。
- 請勿手動編輯 `src/war3map.d.ts`。重新產生時會覆寫內容。
- 在 World Editor 新增、刪除或重新命名物件後，請重新產生，以保持型別同步。

## 範本來源
本專案使用魔獸爭霸Ⅲ的 TypeScript 地圖範本。安裝方式請參考[範本說明](https://cipherxof.github.io/w3ts/docs/getting-started)。

範本提供以下功能：

- 使用 [w3ts](https://github.com/cipherxof/w3ts) 操作遊戲物件。
- 使用 [war3-objectdata](https://github.com/cipherxof/war3-objectdata) 讀寫物件資料。
- 使用 [war3-transformer](https://github.com/cipherxof/war3-transformer) 在編譯時執行程式並寫入結果。
- 將地圖資料夾封裝成 `.w3x` 檔案。
- 從編輯器建立的全域變數產生型別宣告。
