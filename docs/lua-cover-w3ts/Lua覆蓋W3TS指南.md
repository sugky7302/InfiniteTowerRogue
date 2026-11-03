# Warcraft III w3ts 專案中混用與覆蓋原生 Lua 指南

在基於 `w3ts` 與 `TypeScriptToLua (TSTL)` 的魔獸 3 專案中，TypeScript 的高階語法（如陣列操作、物件導向、閉包）有時會產生隱式匿名表，導致 Lua 記憶體洩漏（Memory Leak）。

為了優化效能，你可以透過以下三種方式，**直接編寫純 Lua 代碼來覆蓋、替換或優化**部分系統。

---

## 核心觀念：為什麼 TS 轉 Lua 容易洩漏？
1. **隱式匿名表 (Anonymous Tables)：** 使用 TS 的 `[...array]`、`.map()`、`.filter()` 或物件字面量時，背後會頻繁建立臨時表。
2. **閉包與 Handle 綁定：** 在魔獸的 `Timer` 或 `Trigger` 回呼函數中若使用了外部變數，會形成閉包。如果未手動銷毀或解綁，Lua 的垃圾回收機制（GC）將無法回收這些記憶體。
3. **終極解法：** 使用原生 Lua 撰寫最傳統的 `local` 變數、減少臨時表，並在結束時手動將變數賦值為 `nil`（解除引用）。

---

## 方法一：使用 `W3TS` 生命週期鉤子（適合小範圍覆蓋）

利用 w3ts 自帶的 `addScriptHook`，在地圖邏輯載入完畢後，直接對已經編譯出來的全域變數或函數進行重新賦值（Override）。

```typescript
import { addScriptHook, W3TS_HOOK } from "w3ts";

// 宣告你要覆蓋的 TS/Lua 全域函數或系統，避免 TS 編譯器報錯
declare let MyLeakSystem: any;

addScriptHook(W3TS_HOOK.MAIN_AFTER, () => {
    if (MyLeakSystem) {
        // 直接在 TS 中，用純 Lua 邏輯蓋掉有問題的方法
        MyLeakSystem.processData = function(this: void, targetUnit: any) {
            // 在此處撰寫你優化後的邏輯
            print("該方法已被安全的原生邏輯覆蓋");
            
            // 記得手動解除魔獸 Handle 的引用
            targetUnit = nil; 
        };
    }
});
```

---

## 方法二：使用 TSTL 內嵌純 Lua 代碼（適合單一函數優化）

如果你只想優化 TS 檔案中的某一個特定函數，可以使用 TypeScriptToLua 支持的字串注入語法。

```typescript
// 1. 先在 TS 中宣告這個安全函數的型別
declare let mySafeLuaFunction: (this: void, unit: any) => void;

// 2. 使用巨集與多行字串，將純 Lua 程式碼「原封不動」輸出到最終地圖中
/** @meta _ */
const rawLua = `
function mySafeLuaFunction(u)
    -- 這裡寫最精簡、完全不建立臨時表、手動排泄的原生 Lua 代碼
    if u ~= nil then
        -- 執行邏輯...
    end
    u = nil -- 手動解除引用，防範洩漏
end
`;

// 3. 在 TS 的其他地方就能正常呼叫這個高效率函數
// mySafeLuaFunction(someUnit);
```

---

## 方法三：外掛獨立的 `.lua` 檔案（適合大型系統重寫）

如果你有整套系統想完全用 Lua 控管，不希望受到任何 TS 編譯器的干擾，這是最乾淨的做法。

### 步驟 1：建立純 Lua 檔案
在你的專案源碼目錄中（例如與 `src/` 平級），建立一個純 Lua 檔案（例如 `my_safe_patch.lua`）：

```lua
-- my_safe_patch.lua
print("安全補丁已成功載入！")

-- 假設 TS 編譯出了一個叫 DropSystem 的全域類別
if DropSystem then
    -- 徹底覆蓋掉它原本會洩漏的掉落邏輯
    DropSystem.executeDrop = function(killer, victim)
        local k = killer
        local v = victim
        
        -- 你的超安全、無洩漏版 Lua 代碼...
        
        -- 函式結束前手動釋放
        k = nil
        v = nil
    end
end
```

### 步驟 2：在 TS 入口點引入該檔案
在你的專案入口檔案（通常是 `src/main.ts` 或 `src/index.ts`）的最上方，強制載入該 Lua 檔案：

```typescript
// 告訴 TSTL 不要解析 require 語法，直接輸出原生 require
/** @noSelf */
declare function require(this: void, moduleName: string): any;

// 載入你的外掛 Lua 補丁（注意路徑需與你打包工具設定的 Lua 路徑相符）
require("my_safe_patch");
```

---

## 🛠 排查記憶體洩漏實用工具

在測試地圖時，你可以直接在 Lua 代碼（或透過上述方法注入）中加入這行指令，來觀察記憶體是否持續暴漲：

```lua
-- 輸出當前 Lua 虛擬機佔用的總記憶體量 (KB)
print("當前 Lua 記憶體: " .. collectgarbage("count") .. " KB")

-- 強制執行一次完整的垃圾回收
collectgarbage("collect")
```
