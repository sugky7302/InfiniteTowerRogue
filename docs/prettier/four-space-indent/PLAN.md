---
建立日期: 2026-10-26
是否完成: true
---

# 改用四個空格縮排

## 設計

1. 將 Prettier 的 `tabWidth` 改為 `4`，並保留 `useTabs: false`。
2. 將 VS Code 的 TypeScript 與 JavaScript 縮排設為四個空格，並停用自動偵測縮排。
3. 更新既有設計稿與使用說明。
4. 對既有格式化範圍重新執行格式化，保留原有排除規則。

## 驗證

- 執行 `format:check`，確認全部目標檔案符合新設定。
- 執行 Prettier 的 `--debug-check`，確認格式化前後的語法樹一致，且重複格式化結果穩定。
- 本次只修改格式與工具設定。先前尚未通過的遊戲內驗證仍保留原狀。

## 驗證結果

- 已將 Prettier 設為 `tabWidth: 4` 與 `useTabs: false`，並重新格式化全部目標檔案。
- 已將 VS Code 的 TypeScript 與 JavaScript 縮排設為四個空格，並停用自動偵測縮排。
- `format:check` 通過。
- Prettier 的 `--debug-check` 通過。
- `git diff --check` 通過。
