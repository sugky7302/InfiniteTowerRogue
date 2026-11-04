# ADR-<編號>：<決策名稱>

- 狀態：Proposed / Accepted / Superseded
- 日期：YYYY-MM-DD
- Owner：<團隊或職務>
- 影響範圍：<Context / App / Nx project / FSD Slice>

## 背景與問題

<目前業務能力、程式碼現況、受限條件、已觀測問題；標記假設>

## 業務模型與 Context Map

| Context | 擁有規則 | 對外契約 | 上下游 |
|---|---|---|---|
| ... | ... | ... | ... |

## 方案比較

| 方案 | 優點 | 代價 | 風險／前提 |
|---|---|---|---|
| A：Page-first 單 App | ... | ... | ... |
| B：Context-aware Nx libs | ... | ... | ... |
| C：多 App／微前端 | ... | ... | ... |

## 採用決策與理由

<結論；為何沒有選另一方案>

## FSD 路徑與 import 規則

```text
<目錄樹>
```

允許：<...>
禁止：<...>
例外與期限：<...>

## API / Domain 權威性

- DTO / ACL 所在位置：
- Backend invariants：
- 身份授權／冪等／並發策略：

## 交付與驗證

- [ ] domain tests
- [ ] mapper/contract tests
- [ ] frontend integration/e2e
- [ ] architecture boundary checks
- [ ] rollback plan

## 重新檢視條件

<團隊擴編、部署耦合、跨 Context 變動頻率、模組維護成本>
