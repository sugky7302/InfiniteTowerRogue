---
建立日期: 2026-11-06
是否完成: true
---

# 模組層級常數改名：任務

規格：`PLAN.md`。改名清單、不改名的項目、改名規則與驗證方法都以 `PLAN.md` 為準。

依使用者決定（2026-11-06），本設計的改名由 Codex 執行，不由使用者實作。其他步驟依 `AGENTS.md` 的開發流程：Codex 先寫測試，Antigravity 檢查測試，完成後 Codex 與 Antigravity 分開驗證。

## R1：命名檢查測試（Codex 撰寫，Antigravity 檢查）

- 新增 `tests/naming/constant-naming.spec.ts`，內容依 `PLAN.md` 的「命名檢查測試」。
- 允許清單寫在同一個測試檔中，以「檔案路徑:名稱」與類別寫出 `PLAN.md`「不改名的項目」中的 62 項（帶同名 `type` 的 24 項由自動規則排除，不列入清單）。
- 改名清單（66 項）寫在同一個測試檔中，以「檔案路徑、舊名稱、新名稱」寫出。
- 允許清單的存在檢查使用 `src/` 全部模組層級 `const` 的集合，在套用自動排除（`declare const`、箭頭函式等）之前取得。所以清單中被自動規則排除的項目，也要能確認存在。
- 加入 `tests/run.ts`。
- 只能新增或修改 `tests/naming/` 與 `tests/run.ts`。不得修改 `src/`、`scripts/`。

完成條件：
- 執行此測試時，失敗的項目正好是改名清單的 66 項，沒有其他項目。
- `npm run test:unit` 中，除了此測試以外的測試全部通過。
- `npx prettier --check tests/naming tests/run.ts` 通過。

## R2：保存改名前的物件資料（Claude）

- 在改名前執行 `npm run build`。
- 把 `dist/map.w3x/` 的 `war3map.w3a`、`war3map.w3t`、`war3map.w3u` 複製到工作階段的暫存資料夾。不放入儲存庫。

完成條件：三個檔案已保存，並記下每個檔案的位元組數。

## R3：改名（Codex）

- 依 `PLAN.md` 的「改名規則」與「改名清單」改名。
- 範圍：`src/` 的 66 個宣告；`src/`、`tests/`、`scripts/` 中指向它們的引用；`PLAN.md` 列出的模組物件位置與建置產物測試字串。
- 不得改變值、型別、檔案位置、匯出方式與 import 路徑。
- 不得修改 `tests/naming/`。

完成條件：
- R1 的命名檢查測試通過。
- `PLAN.md`「行為不變」中的全部指令通過（Claude 執行並提供結果）。
- R2 保存的三個檔案與改名後建置的檔案，位元組相同。

## R4：文件與規則（Claude）

- 更新 `.github/skills/` 與未完成的 `docs/*/` 中提到舊名稱的地方。已完成的 `docs/*/PLAN.md` 不改。
- 刪除 `AGENTS.md` 的「既有程式的名稱另外安排一次改名，在此之前不受此規則限制。」。

完成條件：以舊名稱搜尋 `.github/skills/` 與 `AGENTS.md`，除了不改名的同名區域變數或屬性外，沒有結果。

## R5：驗證

- Codex 與 Antigravity 分開驗證 R3 與 R4：是否符合 `PLAN.md`，是否改到不應改的名稱（同名區域變數、一般物件屬性、資料字串）。
- 使用者在測試地圖（`pnpm run test`）中確認：地圖可以啟動、存檔與讀檔正常、物品欄可以打開。

完成條件：兩個驗證者都沒有不通過的項目；遊戲內驗證通過。通過後提交，並把 `PLAN.md` 精煉為 skill 或更新既有 skill。

## 進度

| 任務 | 狀態 |
|---|---|
| R1 | 完成（2026-11-06）：3 組；Codex 撰寫，Antigravity 檢查後沒有修改。改名前 2 組如預期失敗 |
| R2 | 完成（2026-11-06）：`war3map.w3a` 600 位元組、`war3map.w3t` 567 位元組、`war3map.w3u` 760 位元組；連續建置兩次，結果相同 |
| R3 | 完成（2026-11-06）：Codex 改名，60 個檔案；test:unit 988 組，Lua 6 項與產物 7 項測試、lint:fsd、format:check、build 通過；三個物件檔案的位元組與 R2 相同 |
| R4 | 完成（2026-11-06）：`.github/skills/` 沒有舊名稱；更新 `docs/knowledge-panel/` 的 PLAN.md 與 TASK.md；AGENTS.md 的過渡條款改為命名測試的說明 |
| R5 | 完成（2026-11-06）：Codex 與 Antigravity 驗證通過；使用者在遊戲中確認地圖可以啟動、存檔與讀檔正常、物品欄可以打開 |
