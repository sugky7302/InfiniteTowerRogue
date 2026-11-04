# 遷移與 Code Review 作業手冊

## A. 從傳統 Angular 目錄遷移

假設現況：

```text
src/app/
  components/
  services/
  models/
  guards/
  utils/
```

不要一次搬動全部檔案，尤其是早已服務中的交易系統。先找一個目標 use case，例如「取消委託」，逐步遷移。

### PR 0：建立現況基線

- 執行目前專案既有建置與測試；記錄失敗項目及實際版本。
- 盤點 Pages／Routes 與服務、DTO、業務規則依賴。
- 找出 3–5 條高風險／高頻率的跨檔 import。
- 畫候選 Context Map，區分「已確認」、「假設」、「待訪談」。
- 若既有測試不足，補最重要的現有行為特徵測試（characterization tests）。

### PR 1：Page-first 的一個縱切面

- 只搬一個路由及其 page-only view/model/api 到 `pages/<page>`。
- 建 `index.ts` Public API，並讓 router 從 Public API lazy-load。
- 保留現有 Behavior；API contract 不變；不引入全新的 Store 架構。
- 先確保建置、原有測試、主要手動操作正常。

### PR 2：共用底層與真正重用的行為

- 只有當 `shared/ui` 實際在多處重用，才抽技術元件。
- 只有在跨頁／獨立業務價值可驗證時，抽 `features/<use-case>`。
- 只有穩定模型且共享需求明確時，抽 `entities/<concept>`。
- 制定深層匯入禁令；將跨 Slice import 經 index.ts。

### PR 3：領域隔離／防腐層

- 為特定外部 API 加 mapper、schema 驗證或 anti-corruption layer。
- 明確分離 `transport DTO`、`view model`、`backend domain model`。
- 在 Go 後端內建立小範圍的 domain/application 邊界（如果規則足夠複雜）。
- 針對權威性規則建立後端測試與併發處理測試。

### PR 4：正式守門

- 使用 Steiger 檢查 FSD（按版本及 FSD root 設定）。
- 如果是 Nx workspace，加入 scope/type tags、module boundary ESLint rule。
- CI 有意義地拒絕新違規，不把大量歷史違規當成一次性改寫任務。
- 增加 architecture decision record，防止架構在多人維護時漂移。

### PR 5：評估是否需要分 Context packages／多 App

- 僅當團隊 ownership、版本演進、發版與運行邊界明確時再拆。
- 先證明 API 契約可獨立演化，避免只把循環依賴從 import 換成 HTTP。
- 必須有 rollback、共享認證、Tracing、契約測試與失敗處理方案。

## B. 審查分級

| 嚴重度 | 發現範例 | 典型對策 |
|---|---|---|
| Critical | 前端是唯一授權與交易不可變條件驗證點 | 在後端執行權威驗證；補安全／領域測試 |
| High | 不同 Context 直接共用內部狀態機或 Aggregate | 公開契約 + adapter / ACL，檢查邏輯所有權 |
| High | `features/A` 直接 import `features/B`，或 Page 深層 import | Page 組合、抽共同低層、Public API |
| Medium | `shared` 包含大量業務規則 | 依 Context owner 移回適當 Page/Feature/Entity |
| Medium | 每個 DTO 建一個 FSD Entity，跨很多檔案才能理解一條流程 | 回歸 Page-first，刪除無價值抽象 |
| Medium | Angular Page 的網路錯誤提示造成可能的重複交易 | 明確顯示「未知狀態」，加冪等與查詢確認 |
| Low | 命名不一致、目錄過深、無效的 index export | 統一用語、改善導航、少量重構 |

## C. 評估架構品質（每項用證據作答）

1. **可理解性**：新人是否可以沿單一路徑從 Page 找到 Use Case 與 API？
2. **邊界隔離**：改動 Trading 規則會影響幾個與其不相關的 Context？
3. **重用品質**：被抽取的 Feature/Entity 是否真的降低重複與變更成本？
4. **契約穩定**：跨模組是否只看到 Public API，跨 Context 是否使用顯式 DTO？
5. **安全正確性**：重要 invariant 是否由 backend 驗證？是否有競態／重送防護？
6. **測試支撐**：unit/contract/integration/architecture checks 能否捕捉回歸？
7. **部署與治理**：若拆 Monorepo/microfrontend，是否真的獲得獨立性？

**不要提供毫無根據的分數**。若使用者要求評分，應先說明評估維度、給具體證據和不確定性。

## D. ADR 的必要事項

每個重大選擇都記錄：背景與現況、候選方案、取捨、禁止的依賴、測試／CI 守門、遷移與回滾、重新檢視觸發條件。範本見 `../assets/adr-template.md`。

## E. Code Review 回覆格式

用 `../assets/review-template.md`，每個問題附檔案路徑與依賴證據；優先 Critical/High；最後交付**最小可合併的 PR 計畫**，而非整個專案的理想化資料夾樹。

## 參考

- https://fsd.how/docs/guides/migration/from-v2-0/
- https://fsd.how/docs/guides/issues/excessive-entities/
- https://nx.dev/blog/architecting-angular-applications
