---
建立日期: 2026-11-04
是否完成: true
---

# F1 實作記錄

## 做法與檔案

- 依上層規格採用方案 B。保留公開讀寫介面、4096 字元上限與 ITF1 框架。
- `src/shared/file-io/` 改用內嵌 Lua 累加資料。每次資料 emit 最多 259 字元。`writeReadable` 保留原流程。
- `src/shared/wc3-def/file/` 只包裝技能圖示與 Preload 原生操作。參考 w3ts 的內建技能讀寫方式，不建立預載單位，移除 prepare。
- 載體為 `Amls`，FourCC 十進位值為 1097690227。修改前以 git grep 搜尋 maps、src、scripts、i18n，未找到 Amls 或反向位元組 slmA。另以物件資料解析確認 Amls 不是自訂技能，並掃描全部 maps 檔案的 Amls 與反向位元組，參照數為 0。
- 移除 `scripts/file-io.cjs` 與三個範例的技能建立回呼。產物測試檢查 A0IO、AF01 至 AF42 均不存在。
- 更新假介面、Node 測試、Lua 驗證與基準解碼器。假介面載入時解析實際輸出文字，累加 Preload 資料並設定圖示。
- 更新既有 save-system、i18n、wc3-def、rxwc3-benchmark 技能。不要建立新技能。

## 跳脫規則

- ESC 使用 `String.fromCharCode(27)`。
- 先把 ESC 改為兩個 ESC，再把雙引號改為 ESC 加 q。
- 反跳脫從左至右處理跳脫對：兩個 ESC 還原成一個 ESC；ESC 加 q 還原成雙引號。
- 使用 split 與 join。不得使用正規表示式。
- 先跳脫，再依 259 字元切段。讀取時先接回完整資料，再反跳脫。
- 最後一行只呼叫一次 `BlzSetAbilityIcon(1097690227,o)`。數字由 TS 的字元碼計算，不呼叫檔案內的 FourCC。

## 與設計稿的差異

- 檢查時加入：`wc3FileNatives.load` 在 `Preloader` 後還原全域 `Preload` 與 `PreloadEnd`。w3ts 的參考實作沒有還原，讀檔後同一局的寫檔（例如自動讀檔後 `-save`）會被累加函式吞掉。

寫出格式與方案 B 相同。反跳脫改為單次掃描：w3ts 的兩次取代會把原始 ESC 加 q 的文字誤轉成 ESC 加雙引號，單次掃描可完整還原。舊檔沒有改動圖示時回傳 Missing，符合本次任務允許的結果。F2 尚未執行，上層 PLAN.md 的是否完成保持 false。

## F2 遊戲內驗證

1. 寫入 4096 字元資料。關閉並重新開啟地圖，確認內容與長度相同。
2. 建立英雄進度並執行 `-save`。重新開啟地圖，確認自動讀檔與 `-load` 都恢復相同進度。確認指令檔仍可複製。
3. 切換語言。重新開啟地圖，確認語言偏好保留。
4. 刪除測試檔案。重新開啟地圖，確認顯示檔案遺失提示。
5. 放入舊 A0IO／AFxx 格式檔案。確認顯示遺失或內容錯誤提示，且遊戲繼續執行。需要時從舊指令檔手動讀檔。
6. 執行基準測試。確認結果檔與完成標記可讀寫，並用 bench:decode 解碼新格式。

## 驗證結果

F1 已完成。F2 尚未執行。上層規格的是否完成保持 false。

| 指令                              | 結果                                          |
| --------------------------------- | --------------------------------------------- |
| `npm run test:unit`               | 866 項通過，0 項失敗                          |
| `npm run format:check`            | 通過                                          |
| Prettier `--debug-check`          | 通過，結束代碼 0                              |
| `npm run lint:fsd`                | 0 個問題，未加入豁免                          |
| `npm run build`                   | 通過，已封裝 dist/bin/map.w3x；未發生檔案占用 |
| `npm run test:save:lua`           | 15 組通過                                     |
| `npm run test:skill:lua`          | 16 組通過                                     |
| `npm run test:i18n:lua`           | 多語言 11 組、檔案 33 組通過                  |
| `npm run test:benchmark:lua`      | 18 組通過                                     |
| `npm run test:combat:lua`         | 113 組通過                                    |
| `npm run test:hero:lua`           | 124 組通過                                    |
| `npm run test:save:artifact`      | 12 組通過                                     |
| `npm run test:skill:artifact`     | 5 組通過                                      |
| `npm run test:i18n:artifact`      | 8 組通過                                      |
| `npm run test:benchmark:artifact` | 4 組通過                                      |
| `npm run test:combat:artifact`    | 7 組通過                                      |
| `npm run test:hero:artifact`      | 6 組通過                                      |
| `git diff --check`                | 通過                                          |

- Lua 合計 430 組通過；地圖產物合計 42 組通過。
- `war3map.lua` 與封裝腳本一致。`2 ^ 1024` 為 0 筆。
- 地圖產物已檢查 A0IO、AF01 至 AF42 共 43 個技能均不存在。
- 檔案 Lua 驗證在移除 debug 後執行，除假介面外，也把實際 emit 的內嵌程式交給 Lua 解析器執行。4096 字元、ESC、雙引號與跨分段的跳脫對均可往返。
- 圖示測試涵蓋成功、內容錯誤、遺失、空字串、讀取例外、設定標記例外與載入中斷。rawLength 保存反跳脫前的讀回長度，包含 0。
- 例外測試會刻意透過 logger.error 輸出測試錯誤；這些輸出不是驗證失敗。
- 建置仍有既有物件文字缺少翻譯的警告。未在本次工作補齊翻譯。
- 未執行 `npm run test`，未新增套件，未建立提交。

## 4096 字元範例

`example-4096.pld` 由正式 createLocalFileIo.write 搭配假原生介面產生。它是格式範例，不是遊戲磁碟寫入證據。資料為 4096 個 A，框架為 4112 字元，分為 16 段資料，加上前言與結尾，共 18 次 emit。最長 emit 為 259 字元。

前 3 行：

```jass
function PreloadFiles takes nothing returns nothing
    call Preload( "")
//! beginusercode
```

最後 2 行：

```jass
    call PreloadEnd( 0.0 )
endfunction
```

結尾內嵌區塊包含 `BlzSetAbilityIcon(1097690227,o)`，只寫入一次圖示。遊戲產生的外層空白與縮排仍由 PreloadGenEnd 決定。

## 檔案清單

新增：

- `src/shared/file-io/preload.ts`
- `docs/file-io-w3ts/implementation/PLAN.md`
- `docs/file-io-w3ts/implementation/example-4096.pld`

修改：

- `src/shared/file-io/codec.ts`
- `src/shared/file-io/index.ts`
- `src/shared/file-io/local-file.ts`
- `src/shared/wc3-def/file/file-natives.ts`
- `src/shared/wc3-def/file/wc3-file-natives.ts`
- `src/app/save-example.ts`
- `src/shared/i18n/i18n-example.ts`
- `src/shared/rxwc3/benchmark/wc3/example.ts`
- `scripts/decode-bench.cjs`
- `scripts/verify-file-io-lua.cjs`
- `tests/file-io/fake-file-io.ts`
- `tests/file-io/file-io-lua.spec.ts`
- `tests/file-io/file-io.spec.ts`
- `tests/hero-save/cases.ts`
- `tests/inventory/cases.ts`
- `tests/save/chat.spec.ts`
- `tests/rxwc3/benchmark-artifact.spec.ts`
- `tests/rxwc3/benchmark-p3.spec.ts`
- `tests/rxwc3/benchmark-stress.spec.ts`
- `.github/skills/save-system/SKILL.md`
- `.github/skills/i18n/SKILL.md`
- `.github/skills/wc3-def/SKILL.md`
- `.github/skills/rxwc3-benchmark/SKILL.md`

刪除：

- `scripts/file-io.cjs`

## 尚未解決的事項

F1 沒有已知未解決問題。內建圖示不預載的方式、遊戲磁碟寫入、重開地圖讀回與快取行為，仍須在 F2 確認。Node、Fengari 與地圖產物檢查不能代替這些結果。
