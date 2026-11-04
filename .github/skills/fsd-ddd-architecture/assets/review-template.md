# FSD × DDD 架構審查報告

## 結論

- 選擇的模式：A / B / C
- 現況特徵：
- 關鍵取捨：
- 未證實的假設：

## 問題清單（依優先級）

| 等級 | 位置（真實檔案路徑） | 證據 | 違反的責任或依賴規則 | 建議修改 |
|---|---|---|---|---|
| Critical/High/Medium/Low | ... | ... | ... | ... |

## 候選 Context Map

| Context | Ubiquitous Language | Owns | Integration | Confidence |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## 目前 → 建議目錄（只列有必要變更的部分）

```text
<minimal tree>
```

## Import 判斷

- ✅ 合法：`pages/order-history` → `features/cancel-order`
- ❌ 不合法：`features/place-order` → `features/cancel-order`
- ⚠️ 需要正當性：`entities/artist` → `entities/song/@x/artist`

## 最小可合併 PR 計畫

| PR | 范圍 | 驗證 | 回滾方式 |
|---|---|---|---|
| 0 | 建立 baseline | 現有測試 | ... |
| 1 | 一條 vertical slice | ... | ... |
| 2 | 模組公開 API | ... | ... |

## 需要補的測試／風險

- Domain invariant：
- DTO mapper／contract：
- UI state／未知狀態：
- 跨 Context integration：

## 不做的事

- 不因為 FSD 有 Entities 層就將所有 DTO 重建成 Entity。
- 不在沒有用戶／團隊需求時拆成 Microfrontend。
- 不把 backend Domain 換成前端 TypeScript 的假性安全檢查。
