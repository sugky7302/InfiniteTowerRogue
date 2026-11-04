# FSD v2.1 × DDD：模型、架構模式與邊界

## 1. 名詞對照（不是一對一等價）

| DDD 名詞 | 所指意義 | FSD 可能落點 | 注意事項 |
|---|---|---|---|
| Subdomain | 問題空間中的業務子領域 | 可能跨多個頁／多個前端 App | 不等於一個 Slice |
| Bounded Context | 一組一致、明確的模型語義與所有權邊界 | 可由一個 App、Nx project 或一組受控 Slice 表現 | 不必一個 Context 一個 microservice |
| Ubiquitous Language | 一個 Context 內一致使用的業務用語 | Page／Feature／Entity 命名、DTO mapper | 不同 Context 可使用不同語義的同名詞 |
| Aggregate | 一組須維持交易性不變條件的領域物件 | 通常是**後端** Domain | 不應與 FSD Entity 一對一對應 |
| Entity / Value Object | 領域身分、生命週期／以值定義的不可變概念 | 可能是前端 model 的 type 與 pure logic | 與 FSD Entity Layer 不同概念 |
| Application Service / Use Case | 協調使用者目的與 I/O | 前端 Page/Feature model、後端 application | 前端協調 UI；後端維護權威性修改 |
| Repository | 抽象化 Aggregate 的存取 | 後端 domain port + infrastructure adapter | 不等同於 Angular 的 HTTP Service |
| Anti-Corruption Layer (ACL) | 防止外部模型污染本 Context | mapper/adapter、BFF、integration adapter | 尤其重要於 legacy、第三方或跨 Context |
| Domain Event | 領域內重要事實 | 後端 domain/application | 不要與 click event 混為一談 |
| Integration Event | 跨服務、跨 Context 整合訊息 | backend integration/outbox | 發佈時點須與提交交易一致 |

## 2. FSD 原則與 v2.1 的重點

由高至低：`app > pages > widgets > features > entities > shared`；`processes` 是 deprecated，不新增。**不需要使用所有 Layer**。`app` / `shared` 沒有一般意義的 Slice，其他層是 `layer/slice/segment`。

- **Page-first**：先建 `pages`（及 `app`、`shared`）。在確實需要跨頁共享且具有穩定功能時才抽出 `features`、`entities`。以先驗式全面 Entity 化作為預設是 FSD 2.0 時期常見、但 v2.1 不鼓勵的方式。
- **同層 Slice 隔離**：Feature 不 import 另一個 Feature；Page 不 import 另一個 Page。由更高一層組合，或重新辨識底層應有的穩定抽象。
- **公開介面**：`features/place-order/index.ts` 匯出可用行為；其他 Slice 不得依賴該 Slice 內部 `ui/x`、`model/y` 檔案。
- **群組目錄**：`features/trading/place-order` 與 `features/trading/cancel-order` 可視為分組排列，但不要在 `features/trading/` 加置它們共用的隱性程式碼。
- **跨 Entity 引用**：優先存 ID、由 Page 組合；若確有緊密且必要的同層連結，FSD 官方提供 `@x` 明確例外。應紀錄原因、限制適用範圍。
- **技術 Segment**：在 Slice 內使用 `ui/`、`model/`、`api/`、`lib/`、`config/`，不必每個 Slice 都建立全套資料夾。

## 3. 選擇架構模式：先用成本最低的方案

### A. 單一 FSD 應用：Page-first（預設）

```text
src/
  app/
    app.config.ts
    app.routes.ts
  pages/
    order-entry/
      ui/order-entry-page.ts
      model/order-entry-form.ts
      api/place-order.ts
      index.ts
    order-history/
      ui/order-history-page.ts
      index.ts
  shared/
    api/http-client.ts
    ui/
    lib/
```

當 `place-order` 在其他頁面需要重用，或形成獨立清楚用例，再將其搬至 `features/place-order`。當 `OrderSummary` 狀態／格式等模型被多處重用且語義穩定，再抽 `entities/trading-order`。一頁一功能時先不要建立空殼 Feature。

### B. 單 App + 穩定多 Context

```text
apps/
  backoffice/                      # 路由和組裝的 Angular app
libs/
  trading/                        # 可用多個 Nx projects 實作
    domain-contracts/             # Trading 專屬模型／API 契約（嚴格限制出口）
    feature-order-entry/          # 用例或界面模組
  settlement/
    domain-contracts/
    feature-reconciliation/
  shared/
    ui/
    network/
```

**這是 Nx 以 Context/責任兩個維度劃界的選項，不是單一 FSD app 的標準路徑**。若每個 Context package 內套用 FSD，則可以使用 `libs/trading/app-like/src/{pages,features,...}` 等構造，但須明確寫出每個 FSD root 與 build 邊界。不要同時把每個 Nx lib 當作 Slice 和完整 FSD App，導致概念混淆。

決策問題：
1. `Trading` 與 `Settlement` 是否真有不同模型語義和負責團隊？
2. `Order` 是否有不同定義？出現不同的狀態、授權及生命週期嗎？
3. 更改一個 Context 是否經常迫使另一個 Context 重新發版／修改？
4. 是否能用公開契約（API、DTO、read model）避免直接取用彼此內部類型？

### C. 多 App／獨立微前端

只在獨立部署、team ownership、獨立發布、runtime integration 明確且值得支付複雜度時使用。一次 Context 變更若仍需跨微前端同步發布，拆分反而失敗。微前端不等於 DDD、也不自動解決耦合。

## 4. 前端整合三種方式

| 情況 | 推薦方式 | 避免方式 |
|---|---|---|
| 交易頁同時呈現持倉與委託 | Page/BFF composition，各 Context 供應唯讀 DTO | 讓 Trading Entity 直接 import Portfolio Entity |
| 取消委託後更新委託列表 | Page 協調 Use Case success → list refresh；伺服器重新確認 | Feature cancel 直接 import Feature list |
| API schema 來自 legacy backend | ACL mapper，分離 `OrderResponseDto` / `TradingOrder` | 把 DTO 當 Aggregate 並重複使用到所有 Domain |
| 使用者驗證與 token | App DI provider + Shared 基礎 HTTP adapter；領域權限由 backend 驗證 | 在 Shared 中讀取 Trading 業務狀態 |
| 後端跨 Context 工作流程 | 明確應用服務與 API／integration event | 前端同時修改兩個 Aggregate 並宣稱原子成功 |

## 5. 複雜度判斷

請在新增抽象前回答：
- 這個概念的**所有權**是誰？
- 它是否已經被兩個以上不同行為真實使用？即使只被一處使用，是否因獨立業務能力或安全邊界而值得抽離？
- 改動它會影響哪些 Page/Context？
- 抽出後能否更容易測試與重構，而不是產生更多跨檔跳轉？
- 它是否因為名稱相同就被誤當成可共用模型？

過多的資料夾不是品質指標。優先最小完整 vertical slice；在新證據到來時演化。

## 6. Domain Model 所有權與範例

以「委託可否取消」為例：
- 前端：可對 `status === 'pending'` 顯示「可取消」按鈕，這是 UX hint，可能因交易所回報延遲而過期。
- 後端 Trading Aggregate：必須在更新時重查目前狀態、權限與交易規則；必要時依版本號、冪等鍵避免重複取消。
- 後端 Trading application：調用 Aggregate、repository、交易所 adapter 並協調副作用；不在 Component 直接決定交易成功。
- Portfolio／Settlement：不直接 import Trading Aggregate；改從既定整合契約取得符合自身語義的結果。

## 來源

- https://fsd.how/docs/get-started/overview/
- https://fsd.how/docs/guides/migration/from-v2-0/
- https://fsd.how/docs/guides/issues/excessive-entities/
- https://feature-sliced.design/docs/concepts/app-splitting
- https://docs.aws.amazon.com/prescriptive-guidance/latest/micro-frontends-aws/micro-frontend-concepts.html
- https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design
