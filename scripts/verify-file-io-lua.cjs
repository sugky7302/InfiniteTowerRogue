const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const tstl = require("typescript-to-lua");
// 使用專案既有的 Lua 5.3 虛擬機，不新增套件。
const {
    lua,
    lauxlib,
    lualib,
    to_luastring,
    to_jsstring,
} = require("../node_modules/.pnpm/fengari@0.1.5/node_modules/fengari");
const parsed = tstl.parseConfigFileWithSystem("tsconfig.rxwc3.json");
const fixture = path.resolve("tests/file-io/file-io-lua.spec.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/file-io-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("file-io-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write("本地檔案 Lua 驗證程式轉譯失敗。\n");
    process.stderr.write(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: (name) => name,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => "\n",
        }),
    );
    process.exit(1);
}
fs.mkdirSync(".cache", { recursive: true });
fs.writeFileSync(".cache/file-io-validation.lua", bundle);
const checks = `
-- 遊戲沒有 debug。此驗證也不能依賴它。
debug = nil
local validation = (function(...) ${bundle} end)()
assert(validation.verifyFileIo() == 28, '檔案共用流程的組數錯誤')
local icon, emitted = '原始圖示', {}
local stored
BlzGetAbilityIcon = function(...)
  assert(select('#', ...) == 1 and (...) == 1097690227, '讀取圖示收到額外 self 或技能錯誤')
  return icon
end
BlzSetAbilityIcon = function(...)
  local id, text = ...
  assert(select('#', ...) == 2 and id == 1097690227, '設定圖示收到額外 self 或技能錯誤')
  icon = text
end
PreloadGenClear = function(...) assert(select('#', ...) == 0) end
PreloadGenStart = function(...) assert(select('#', ...) == 0); emitted = {} end
Preload = function(...)
  local line = ...
  assert(select('#', ...) == 1 and #line <= 259, 'emit 長度或參數錯誤')
  emitted[#emitted + 1] = line
end
PreloadEnd = function() end
PreloadGenEnd = function(...)
  assert(select('#', ...) == 1 and (...) == 'slot.pld')
  stored = {}
  -- 合併內嵌 Lua 與資料呼叫，交給真正的 Lua 解析器執行。
  for _, line in ipairs(emitted) do
    local head = string.find(line, '//! beginusercode', 1, true)
    if head then
      local tail = assert(string.find(line, '//!endusercode', head, true))
      stored[#stored + 1] = string.sub(line, head + #'//! beginusercode', tail - 1)
    else
      stored[#stored + 1] = 'Preload("' .. line .. '")'
    end
  end
end
Preloader = function(...)
  assert(select('#', ...) == 1 and (...) == 'slot.pld')
  if stored then
    local savedPreload, savedEnd = Preload, PreloadEnd
    assert(load(table.concat(stored, string.char(10))))()
    Preload, PreloadEnd = savedPreload, savedEnd
  end
end
CreateUnit = function() error('本地讀寫建立單位') end
CreateTrigger = function() error('本地讀寫建立觸發器') end
CreateGroup = function() error('本地讀寫建立群組') end
UnitAddAbility = function() error('本地讀寫建立技能資源') end
local files = validation.createLocalFileIo(validation.natives)
assert(files:read('slot.pld').status == '沒有檔案或無法讀取' and icon == '原始圖示', '正式遺失或還原錯誤')
assert(files:write('slot.pld', 'ABC').status == '已送出，尚未確認磁碟寫入' and #emitted == 3, '正式寫入錯誤')
assert(files:read('slot.pld').data == 'ABC' and icon == '原始圖示', '內嵌 Lua 讀回或還原錯誤')
assert(files:write('slot.pld', string.rep('A', 4096)).status == '已送出，尚未確認磁碟寫入' and #emitted == 18, '4096 字元分段錯誤')
assert(files:read('slot.pld').data == string.rep('A', 4096) and icon == '原始圖示', '4096 字元內嵌 Lua 讀回錯誤')
local special = string.char(27) .. 'q"' .. string.char(27, 27) .. '"'
local escaped = validation.escapeFileData(special)
local savedPreload, savedEnd = Preload, PreloadEnd
local actual
BlzSetAbilityIcon = function(id, text) assert(id == 1097690227); actual = text end
assert(load(stored[1] .. 'Preload("' .. escaped .. '")' .. stored[#stored]))()
Preload, PreloadEnd = savedPreload, savedEnd
assert(validation.unescapeFileData(actual) == special, 'ESC 與雙引號內嵌 Lua 往返錯誤')
`;
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(state, to_luastring(checks));
if (status !== lua.LUA_OK) {
    process.stderr.write(to_jsstring(lauxlib.luaL_tolstring(state, -1)) + "\n");
    process.exitCode = 1;
} else {
    process.stdout.write(
        "本地檔案 Lua 5.3 驗證：33 組通過，0 組失敗（共用流程 28 組、正式介面與內嵌 Lua 5 組）。\n",
    );
    process.stdout.write("假原生函式不能證明遊戲磁碟讀寫、預載檔快取或多人安全性。\n");
}
