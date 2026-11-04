# FSD × DDD Architecture — Agent Skill

適用於 Angular / TypeScript 前端、Go/Gin 後端與 Nx Monorepo 的架構分析、模組拆分、Code Review 和漸進式重構。使用 **Feature-Sliced Design v2.1 + Domain-Driven Design**，不是任一官方框架的規範套件。

## 安裝

下載並解壓縮，將**整個 `fsd-ddd-architecture` 資料夾**放入你的 Agent 支援的 Skill 目錄，例如：

```text
<repo>/.agents/skills/fsd-ddd-architecture/SKILL.md
```

部分 Agent 使用其專屬的 skills 目錄；實際放置位置依所用工具的版本與文件調整。也可直接把 `SKILL.md` 指定給支援自訂指令的 Coding Agent。

## 檔案

- `SKILL.md`：可直接載入 Agent 的工作流程和架構約束。
- `references/method-and-boundaries.md`：FSD/DDD 對照、架構抉擇和邊界規則。
- `references/practical-cases.md`：開源案例、官方指南、來源連結和適用範圍。
- `references/angular-go-trading-example.md`：證券交易縱切面、Angular/Go 程式碼。
- `references/enforcement-and-tests.md`：Nx、Steiger、測試策略。
- `references/migration-and-review.md`：分階段重構劇本及評估維度。
- `assets/adr-template.md`：Architecture Decision Record 範本。
- `assets/review-template.md`：AI 審查回覆範本。

## 呼叫範例

> 請使用 fsd-ddd-architecture Skill 分析這個 Angular 專案，給出 Context Map、FSD 分層、需要修正的 import、各階段遷移 PR 和測試策略。不要預先為每個 DTO 建立 Entity。

## 來源

參考 `references/practical-cases.md`。本文檔範例是根據公開指引**自行設計的示範**，不代表那些開源專案採用完整 DDD。最後核對：2026-11-04。
