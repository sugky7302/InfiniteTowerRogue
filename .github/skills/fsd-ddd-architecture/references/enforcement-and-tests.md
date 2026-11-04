# 依賴約束、Lint、自動化驗證與測試

## 1. FSD Layer 的依賴矩陣

| 引用來源 | 可以引用（其他 Slice） | 不能引用 |
|---|---|---|
| `app` | lower layer（pages/widgets/features/entities/shared） | 不依賴任何更高 layer |
| `pages/<a>` | widgets/features/entities/shared | `pages/<b>`，app |
| `widgets/<a>` | features/entities/shared | `widgets/<b>`，pages |
| `features/<a>` | entities/shared | `features/<b>`，widgets/pages |
| `entities/<a>` | shared | `entities/<b>`（`@x` 是具限制的例外）、更高層 |
| `shared` | 同 Shared segments 與第三方基礎套件 | 任一帶業務語義的更高 Layer |

`processes` 層已 deprecated，不要新建。

例外：官方 Entity `@x` cross-import 是顯式契約且應記錄；不能拿來迴避錯誤的領域切分。

## 2. CLI 快速檢查

官方 FSD 提供 Steiger。先核對工具版本、workspace layout，再執行：

```bash
# 單一應用的典型目錄；以實際 FSD root 取代 src
npx steiger src
```

特別關注 `insignificant-slice`、`excessive-slicing`：這些是**建議的診斷**，不是看到一個警告就無條件自動搬動程式碼。先確認為何 Slice 存在、有沒有架構理由。

在 CI 建議順序：`lint` → architecture check → unit tests → contract tests → integration tests。實際命令要依 `package.json` 配置，不要假設已有 `lint`/`test` scripts。

## 3. Nx Project Boundary（獨立專案才適用）

當某個 Bounded Context 對應數個 Nx lib，建議同時標記：

- `scope:trading` / `scope:portfolio` / `scope:settlement` / `scope:shared`
- `type:feature` / `type:domain` / `type:data-access` / `type:ui` / `type:util`

**示意**：在 `eslint.config.mjs` 的 `@nx/enforce-module-boundaries` rule 中使用下列 `depConstraints`（需依專案的 tag 分配與外部 libraries 修訂）：

```js
const depConstraints = [
  { sourceTag: 'scope:trading', onlyDependOnLibsWithTags: ['scope:trading', 'scope:shared'] },
  { sourceTag: 'scope:portfolio', onlyDependOnLibsWithTags: ['scope:portfolio', 'scope:shared'] },
  { sourceTag: 'scope:settlement', onlyDependOnLibsWithTags: ['scope:settlement', 'scope:shared'] },
  { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
  { sourceTag: 'type:domain', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
  { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:domain', 'type:util'] },
  { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:domain', 'type:data-access', 'type:util'] },
];
```

重要說明：

1. Nx `onlyDependOnLibsWithTags` 用於**project-to-project** 依賴；不保證同一個 project 內 `features/A → features/B` 合規。
2. 上面的 `type` 是 Nx project 角色，不是 FSD 的一對一映射；專案中沒有某類 project 就移除或調整條件。
3. 同一個 `sourceTag` 被不同規則限制時，請確認 rule 實際如何組合；避免 `allowed` 清單意外放行跨 Context 依賴。
4. 只允許 `scope:shared` 供應技術共用能力；跨 Context 合約應以公開 API／ACL 處理，按需要建立特定 integration package，而不是濫設共享例外。

## 4. Deep import 與 Public API

**不推薦**：

```ts
import { cancelOrder } from '@/features/cancel-order/model/internal-service';
```

**推薦**：

```ts
import { cancelOrder } from '@/features/cancel-order';
```

`index.ts` 只暴露其他 Layer 真的需要的型別／函式；不要 re-export 整個 `model/`，否則 Public API 等於無防護。

## 5. 試算／領域規則測試的優先序

1. **Domain invariants**：每個禁止與允許的轉移都要有測試；狀態型別不要只靠 TypeScript union 代替 runtime 驗證。
2. **DTO adapter/mapper**：OpenAPI 契約變動、空值、enum mapping、資料一致性。
3. **Feature/page integration**：儲存狀態、loading/error/timeout、重送、權限 UI。
4. **Cross-context integration**：retry、outbox、event duplication、eventual consistency、契約相容性。
5. **Architecture test**：CI 在新的非法 import 出現時失敗。

## 6. Angular 技術細節

- Standalone Components 及 lazy routes 適合由 `app/routes` 掛載公開的 Page export。
- Signals 可用於局部 UI state；RxJS 處理 HTTP stream、cancellation 等非同步流。`toSignal` 在 injection context 中訂閱，**不要在每次方法呼叫中反覆建立**。
- State manager（NgRx/Signals/ComponentStore 等）是技術選項，不能取代 Context ownership。狀態 scope 盡量收斂到 Page / Feature，真正需要才設全域 store。
- Backend `401/403` 的前端顯示與權限「預判」分離；不能單靠 Angular route guard 作真正授權。

## 核對來源

- https://fsd.how/docs/guides/migration/from-v2-0/
- https://feature-sliced.design/docs/concepts/low-coupling
- https://nx.dev/docs/features/enforce-module-boundaries
- https://nx.dev/blog/architecting-angular-applications
- https://angular.dev/guide/signals/rxjs-interop
