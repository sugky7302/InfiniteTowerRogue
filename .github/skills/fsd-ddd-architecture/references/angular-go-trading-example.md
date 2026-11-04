# Angular + Golang：證券委託的縱切面示範

> **原創、示意性案例**：這不是實際交易平台的原始碼，也不構成合規、資安或交易規則的充分實作。具體價格精度、交易時段、風控、帳戶授權與交易所取消回應都必須依實際市場建模。

## 1. DDD 初步建模（待業務訪談驗證）

| Bounded Context（候選） | 擁有的用語與規則 | 避免跨 Context 共用的內部模型 |
|---|---|---|
| Trading | Order、PlaceOrder、RequestCancel、OrderStatus | Trading Aggregate、交易所狀態機 |
| Portfolio | Position、AvailableQuantity、Valuation | Position Aggregate／投影模型 |
| Settlement | SettlementInstruction、Reconciliation | 結算狀態與對帳規則 |
| Identity | Principal、Permission、Session | Token、授權政策 |

同名 `Order` 在 Trading 與其他系統不一定相同。Context 間以**對外契約**整合，不直接引用 Aggregate。

### Trading Invariants（示意）

- 只有具權限的帳戶能對自身委託提出取消要求（此條由後端應用授權／資料查詢驗證）。
- `Filled`、`Cancelled` 之委託不得再提出取消請求。
- 送出「取消請求」不等於交易所已確認「已取消」。
- 跨系統取消訊息應在本地事務提交後可靠送出，例如 transactional outbox。
- 前端 disabled Button 只是提示；交易狀態可能隨時改變。

## 2. Page-first 初始 Angular 結構

當下單只有一頁在用，**先不要創立 Feature 和 Entity**：

```text
src/
  app/
    app.routes.ts
  pages/
    order-entry/
      ui/order-entry-page.ts
      model/order-entry.types.ts
      api/order-entry.api.ts
      index.ts
    order-history/
      ui/order-history-page.ts
      index.ts
  shared/
    api/                       # HttpClient 基礎設定、interceptor
    ui/                        # button、表單原件
```

### DTO 與 View Model（`pages/order-entry/model/order-entry.types.ts`）

```ts
// API 邊界的 Transport Contract
export interface PlaceOrderRequestDto {
  symbol: string;
  quantity: number;
  limitPrice: string; // 示意：避免 JSON float 代表十進位金融金額
}

export interface PlaceOrderResponseDto {
  orderId: string;
  accepted: boolean;
}

// 僅屬於此頁面的輸入狀態
export interface OrderEntryDraft {
  symbol: string;
  quantityText: string;
  limitPriceText: string;
}

export function toPlaceOrderRequest(draft: OrderEntryDraft): PlaceOrderRequestDto {
  const quantity = Number(draft.quantityText);
  if (!draft.symbol.trim() || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('Invalid order draft');
  }
  // 金額的有效位數／tick size 等須依實際產品規範處理，不能只靠 Number。
  if (!/^\d+(\.\d+)?$/.test(draft.limitPriceText)) {
    throw new Error('Invalid limit price');
  }
  return {
    symbol: draft.symbol.trim(),
    quantity,
    limitPrice: draft.limitPriceText,
  };
}
```

### Angular HTTP Adapter（`pages/order-entry/api/order-entry.api.ts`）

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { PlaceOrderRequestDto, PlaceOrderResponseDto } from '../model/order-entry.types';

@Injectable()
export class OrderEntryApi {
  private readonly http = inject(HttpClient);

  placeOrder(dto: PlaceOrderRequestDto): Observable<PlaceOrderResponseDto> {
    return this.http.post<PlaceOrderResponseDto>('/api/trading/orders', dto);
  }
}
```

### Angular Page（`pages/order-entry/ui/order-entry-page.ts`）

```ts
import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup } from '@angular/forms';
import { finalize } from 'rxjs';
import { OrderEntryApi } from '../api/order-entry.api';
import { toPlaceOrderRequest } from '../model/order-entry.types';

@Component({
  selector: 'app-order-entry-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  providers: [OrderEntryApi],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <input aria-label="證券代碼" formControlName="symbol" />
      <input aria-label="數量" formControlName="quantityText" />
      <input aria-label="限價" formControlName="limitPriceText" />
      <button type="submit" [disabled]="submitting()">送出委託</button>
      <p role="status">{{ feedback() }}</p>
    </form>
  `,
})
export class OrderEntryPage {
  private readonly api = inject(OrderEntryApi);
  readonly submitting = signal(false);
  readonly feedback = signal('');
  readonly form = new FormGroup({
    symbol: new FormControl('', { nonNullable: true }),
    quantityText: new FormControl('', { nonNullable: true }),
    limitPriceText: new FormControl('', { nonNullable: true }),
  });

  submit(): void {
    if (this.submitting()) return;
    let dto;
    try {
      dto = toPlaceOrderRequest(this.form.getRawValue());
    } catch {
      this.feedback.set('請確認委託資料格式');
      return;
    }

    this.submitting.set(true);
    this.api.placeOrder(dto).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (result) => this.feedback.set(
        result.accepted ? `已受理：${result.orderId}` : '委託未受理'
      ),
      error: () => this.feedback.set('提交失敗，請查詢委託狀態後再決定是否重送'),
    });
  }
}
```

> 生產系統還要補上：Angular reactive validation、數量／金額／交易時段規則、身份授權、Request Id/Idempotency Key、交易所回報的非同步狀態、API timeout 的不確定結果處理、無障礙與測試。HTTP 失敗不等於交易沒有成交；**不能直接提示使用者盲目重送**。

### App HttpClient Provider / Public API / Lazy Route

`app/app.config.ts` 須提供 HttpClient（並註冊路由）；若現有專案已配置則沿用：

```ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(), provideRouter(routes)],
};
```

```ts
// pages/order-entry/index.ts
export { OrderEntryPage } from './ui/order-entry-page';

// app/app.routes.ts
import type { Routes } from '@angular/router';
export const routes: Routes = [
  {
    path: 'orders/new',
    loadComponent: () => import('../pages/order-entry').then(m => m.OrderEntryPage),
  },
];
```

同一 Slice 內的相對路徑 import 是允許的；只有**外部 Slice**必須經 Public API。

## 3. 何時升級為共享 Feature / Entity

當 `order-history`、`portfolio` 等其他頁面都需要取消委託操作與委託摘要時：

```text
src/
  pages/
    order-entry/
    order-history/                 # 組合 OrderSummary + CancelOrderButton
  features/
    cancel-order/
      ui/cancel-order-button.ts
      api/cancel-order.api.ts
      model/cancel-order.state.ts
      index.ts
  entities/
    trading-order/
      model/order-summary.ts
      api/order-summary.mapper.ts
      index.ts
  shared/
    api/
```

`features/cancel-order` 可以 import `entities/trading-order`，但**不能** import `features/place-order`。`pages/order-history` 才是兩個 Feature 與 Entity 的組合者。

```ts
// entities/trading-order/model/order-summary.ts
export type OrderStatus = 'PENDING' | 'PARTIALLY_FILLED' |
  'CANCEL_PENDING' | 'CANCELLED' | 'FILLED';

export interface OrderSummary {
  id: string;
  status: OrderStatus;
}

// UX hint；後端必須重查狀態、權限與風控。
export function canOfferCancel(order: OrderSummary): boolean {
  return order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED';
}

// entities/trading-order/index.ts
export type { OrderSummary, OrderStatus } from './model/order-summary';
export { canOfferCancel } from './model/order-summary';
```

## 4. Go 後端：Aggregate 狀態轉移與 Application Service

```text
internal/
  trading/
    domain/
      order.go                   # Order Aggregate / invariants
      order_repository.go       # Repository port (interface)
    application/
      request_cancel.go         # Use Case; transaction + idempotency
    infrastructure/
      postgres/
      exchange/
      outbox/
    transport/
      http/
```

### Aggregate（簡化範例）

```go
package domain

import "errors"

type Status string

const (
    Pending         Status = "PENDING"
    PartiallyFilled Status = "PARTIALLY_FILLED"
    CancelPending   Status = "CANCEL_PENDING"
    Cancelled       Status = "CANCELLED"
    Filled          Status = "FILLED"
)

var ErrCannotCancel = errors.New("order is not cancelable")

type Order struct {
    ID        string
    AccountID string
    Status    Status
    Version   int64
}

func (o *Order) RequestCancel() error {
    switch o.Status {
    case Pending, PartiallyFilled:
        o.Status = CancelPending // 只是「已提出取消請求」，非交易所已取消
        return nil
    default:
        return ErrCannotCancel
    }
}
```

### Use Case（說明用 pseudocode，介面型別須在實作時補齊）

```go
func (s *Service) RequestCancel(ctx context.Context, accountID, orderID, requestID string) error {
    return s.tx.Within(ctx, func(txCtx context.Context) error {
        // 1. 驗證登入身分、帳戶操作權限與冪等鍵（示意，略）
        // 2. LoadForUpdate 或 optimistic locking 防止競態更新
        order, err := s.orders.LoadForUpdate(txCtx, accountID, orderID)
        if err != nil { return err }
        if err := order.RequestCancel(); err != nil { return err }
        if err := s.orders.Save(txCtx, order); err != nil { return err }
        // 3. 在同一 DB transaction 中寫 Outbox，提交後由 worker 投遞
        return s.outbox.Enqueue(txCtx, "OrderCancelRequested", order.ID, requestID)
    })
}
```

**注意**：取消請求的交易所回執、取消成功、部分成交、拒絕取消都需要明確狀態流程；交易所/API 呼叫通常不能假設參與單一 DB Transaction。這是金融系統的最關鍵邊界之一。

## 5. 建議的測試

- Angular model：非法 quantity、非法 price 格式、前端狀態 hint。
- Angular API mapper：DTO schema 變更、缺值、錯誤狀態。
- Angular page：送出後 loading、成功／失敗／timeout 文案、重送保護。
- Go domain：`Pending/PartiallyFilled → CancelPending`，`Filled/Cancelled` 應拒絕。
- Go application：同帳戶授權、交易隔離、並發更新、冪等鍵、outbox 在 commit 後可靠投遞。
- Contract：用 OpenAPI 等核對 DTO，不把伺服器「受理」和「成交／取消完成」混淆。

## 延伸參考

- https://angular.dev/best-practices/performance/lazy-loaded-routes
- https://angular.dev/guide/signals/rxjs-interop
- https://learn.microsoft.com/en-us/azure/architecture/microservices/model/tactical-domain-driven-design
- https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation
