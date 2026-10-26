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
assert(validation.verifyFileIo() == 10, '檔案共用流程的組數錯誤')
local created, removed, tooltip, emitted = 0, 0, '原始提示', {}
local expected = {hpea = 1752196449, A0IO = 1093683535}
FourCC = function(code) assert(expected[code], '技能或單位代碼錯誤'); return expected[code] end
PLAYER_NEUTRAL_PASSIVE = 27
local player, carrier = {}, {}
Player = function(id) assert(id == 27); return player end
CreateUnit = function(...)
  local p, id, x, y, facing = ...
  assert(select('#', ...) == 5 and p == player and id == expected.hpea and x == 0 and y == 0 and facing == 0)
  created = created + 1
  return carrier
end
ShowUnit = function(target, show) assert(target == carrier and show == false) end
UnitAddAbility = function(target, id) assert(target == carrier and id == expected.A0IO); return true end
RemoveUnit = function(target) assert(target == carrier); removed = removed + 1 end
BlzGetAbilityTooltip = function(...)
  local id, level = ...
  assert(select('#', ...) == 2 and id == expected.A0IO and level == 0, '讀取技能收到額外 self')
  return tooltip
end
BlzSetAbilityTooltip = function(...)
  local id, text, level = ...
  assert(select('#', ...) == 3 and id == expected.A0IO and level == 0, '設定技能收到額外 self')
  tooltip = text
end
PreloadGenClear = function(...) assert(select('#', ...) == 0) end
PreloadGenStart = function(...) assert(select('#', ...) == 0) end
Preload = function(...)
  local line = ...
  assert(select('#', ...) == 1 and #line < 200)
  emitted[#emitted + 1] = line
end
PreloadGenEnd = function(...) assert(select('#', ...) == 1 and (...) == 'slot.pld') end
Preloader = function(...) assert(select('#', ...) == 1 and (...) == 'slot.pld') end
local files = validation.createLocalFileIo(validation.natives)
assert(created == 1 and removed == 1, '未在共同流程預先載入技能')
CreateUnit = function() error('本地讀寫建立單位') end
CreateTrigger = function() error('本地讀寫建立觸發器') end
CreateGroup = function() error('本地讀寫建立群組') end
UnitAddAbility = function() error('本地讀寫建立技能資源') end
assert(files:read('slot.pld').status == '沒有檔案或無法讀取' and tooltip == 'ITF-IDLE', '正式讀取或恢復錯誤')
assert(files:write('slot.pld', 'ABC').status == '已送出，尚未確認磁碟寫入', '正式寫入錯誤')
assert(#emitted == 2 and string.find(emitted[1], 'ITF1|', 1, true), '預載檔語句錯誤')
`;
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(state, to_luastring(checks));
if (status !== lua.LUA_OK) {
    process.stderr.write(to_jsstring(lauxlib.luaL_tolstring(state, -1)) + "\n");
    process.exitCode = 1;
} else {
    process.stdout.write(
        "本地檔案 Lua 5.3 驗證：12 組通過，0 組失敗（共用流程 10 組、共同資源 1 組、正式本地原生介面 1 組）。\n",
    );
    process.stdout.write("假原生函式不能證明遊戲磁碟讀寫、預載檔快取或多人安全性。\n");
}
