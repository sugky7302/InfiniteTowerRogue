# 實務案例：來源證據、可學之處與限制

> 最後核對：2026-11-04。**以下不宣稱這些專案全部同時使用完整 DDD + FSD**。請將「已查證的事實」與「本 Skill 的架構延伸」分開。

## A. RealWorld React FSD：Page-first / 漸進抽取

**開源實作**：https://github.com/yurisldk/realworld-react-fsd

**可查證事實**：README 明確說明目前目錄偏向 `src/app`、`src/pages`、`src/shared`，不是完整使用全部 FSD Layer；route module lazy-load；API 從 OpenAPI 產生，使用 React Query、Zod；使用 dependency-cruiser 檢查圖。

**學到的原則**：與其預設大量 `entities` 和 `features`，先保持 Page 封裝與路由邊界。只有重用與業務穩定性足夠才下沉。這與 FSD v2.1 的 Page-first 一致。

**不應推論**：這個專案包含完整 DDD Aggregate／多個 Bounded Context；README 未作此承諾。React 路由實作不能直接照搬為 Angular API。

## B. Angular Feature Sliced V2 / Nx：Angular 如何搭配受控模組

**開源實作**：https://github.com/Affiction/angular-feature-sliced

**可查證事實**：repo 有 `apps/`、`libs/`、`nx.json`；README 標示 Angular、NgRx、TypeScript、ESLint、FSD V2。FSD 官方範例清單收錄此 Angular Todo 範例。

**學到的原則**：Angular 可搭配 Nx 多專案邊界與 FSD 思想；處理依賴應靠 lint／project constraints，不只靠資料夾命名。

**限制**：此為示範用例、FSD V2 舊樣本，不能因此推定它已遵守全部 v2.1 新指南或實作 DDD。請勿將 Angular 13 時代模式視為新版最佳實務。

## C. Roketo Business UI：多 App Monorepo

**開源實作**：https://github.com/roke-to/roketo-business-ui

**可查證事實**：repo 有 `apps/`、`packages/`、`turbo.json`；README 說明包含 Solana 和 Near 兩個 DApp。FSD 官方範例清單列為 FSD 範例。

**學到的原則**：多應用程式可共置 Monorepo，而各 App 可以有自身呈現和開發節奏；共享技術 package 必須有清楚 API。

**限制**：依鏈別劃分 App 不代表就是 DDD 的 Bounded Context；它可能是部署／平台差異，不能做一對一映射。

## D. Moonlogs：Go 後端 + FSD 前端的全端參照

**開源實作**：https://github.com/pijng/moonlogs

**可查證事實**：repo 包含 Go module、`internal/` 與 `web/`，FSD 官方範例收錄；README 指出它是依業務領域整理事件記錄的工具，包含 schema、filters、存取標籤。

**學到的原則**：前端 FSD 與 Go backend 可以並存，而不必讓 Go 目錄複製 FSD Layer。

**限制**：不能因此認定其 Go backend 已實作經典 DDD Aggregates 或 Event Sourcing。`event logging` 不等於 Domain Event 或 Event Sourcing。

## E. Nx 官方 Angular 架構指南：Scope + Type 的雙向約束

**實務指南（非特定專案的 DDD 證明）**：https://nx.dev/blog/architecting-angular-applications

**可查證事實**：示範以 `scope:orders`、`scope:products` 與 `type:feature`、`type:ui`、`type:data-access` 雙維度的 tagging 管理 library dependencies；提供漸進式分離／何時建立新 library 的判準。

**學到的原則**：大型 Angular 系統可利用 Nx 對模組邊界做機械式 enforcement；Context boundary 與 technical boundary 應分別表達。

**限制**：這是 Nx modularization 的指導，不等同 FSD 標準 Layer 的直接映射；必須按專案寫 dependency rule。

## F. AWS Micro-frontends + DDD：Bounded Context 何時值得升級為部署邊界

**官方實務指南**：https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/micro-frontend-concepts.html

**可查證事實**：AWS 以航班搜尋頁面討論 DDD 與微前端的邊界；指出強烈互相通信的 UI 功能可能屬於同一個 Context，單一按鈕不構成 Context。

**學到的原則**：切 Context 靠業務凝聚度與溝通模式，不是靠 Component 數量或路由分頁。

**限制**：AWS 文件提供架構分析範例，並非可直接 clone 的 Angular/FSD 實作。

## G. Microsoft DDD 微服務指南：Aggregate / Invariant / Domain Events

**官方實務指南**：
- https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design
- https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation

**可查證事實**：Aggregate 是交易性一致性邊界；Domain Service 與 Application Service 責任不同；跨 Context 整合事件應在成功提交之後發布，避免未提交的狀態外洩。

**學到的原則**：交易規則與不可變條件在後端 Domain；前端 FSD 組織互動、查詢和顯示，不能單靠按鈕 disabled 來保證財務／證券交易安全。

**限制**：其中實作範例偏向 .NET/microservices；在 Go 可以沿用設計原則，但不是逐字翻譯框架。

## H. 本 Skill 的證券交易範例（**原創構想，不是外部專案**）

參考 `angular-go-trading-example.md`：

- Trading：委託、取消、委託狀態轉移、冪等性。
- Portfolio：持倉查詢與部位評估（可能由交易結果形成唯讀投影）。
- Settlement：交割安排、對帳、狀態與規則。
- Frontend：Page-first，逐步抽取 reusable order summary 與 cancel/place features。
- Backend：以 Go 實作 Trading use case，權威驗證落在 Domain／application transaction boundary。

**提醒**：實際證券交易規則取決於市場、交易所、券商與系統需求；範例不代表合規實作。

## FSD v2.1 與 Agent Skills 來源

- FSD 官方 overview：https://fsd.how/docs/get-started/overview/
- FSD v2.1 轉換指南：https://fsd.how/docs/guides/migration/from-v2-0/
- 避免 excessive entities：https://fsd.how/docs/guides/issues/excessive-entities/
- FSD 官方 Skill（可互補使用，請勿整份照抄）：https://github.com/feature-sliced/skills/blob/master/feature-sliced-design/SKILL.md
- Agent Skills specification：https://agentskills.io/specification
- Angular Router：https://angular.dev/best-practices/performance/lazy-loaded-routes
- Angular Signals / RxJS：https://angular.dev/guide/signals/rxjs-interop
- Nx project boundaries：https://nx.dev/docs/features/enforce-module-boundaries
