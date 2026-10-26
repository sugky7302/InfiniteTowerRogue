---
建立日期: 2026-10-26
是否完成: true
---

# 修正 w3i v39 導致建置失敗

## 問題

`pnpm run build` 在 `Creating w3x archive...` 階段失敗：

```
Error: ByteStream: readUint8Array: premature end - want 8 bytes but have 0
    at Player.load (mdx-m3-viewer-th/.../w3i/player.ts)
    at War3Map.getMapInformation
    at War3Map.save
```

## 原因

- `maps/map.w3x/war3map.w3i` 由新版 World Editor 存檔，格式版本為 **39**。
- `mdx-m3-viewer-th`（最新 5.13.4）的 w3i 解析器只支援到版本 33，新版欄位位移導致讀取玩家資料時越界。
- `War3Map.save()` 呼叫 `getMapInformation()` 僅為了取得 `buildVersion`，以判斷是否需要寫入 1.31 以前的 512 bytes `HM3W` 標頭。

## 方案

在 `scripts/build.ts` 中覆寫該 `War3Map` 實例的 `getMapInformation()`，只讀取 w3i 標頭：

- `version`、`saves`、`editorVersion`
- `buildVersion`（僅 version > 27 時存在）

其餘欄位不解析。建置流程不需要完整的 w3i 內容，因此不影響輸出；地圖內的 w3i 檔案本身原封不動打包。

## 不採用的方案

- 修改 `node_modules` / patch-package：需追蹤 v39 完整格式，維護成本高。
- 等待套件更新：目前已是最新版本。
