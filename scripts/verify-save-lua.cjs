const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const tstl = require("typescript-to-lua");
const {
    lua,
    lauxlib,
    lualib,
    to_luastring,
    to_jsstring,
} = require("../node_modules/.pnpm/fengari@0.1.5/node_modules/fengari");
const parsed = tstl.parseConfigFileWithSystem("tsconfig.rxwc3.json");
const fixture = path.resolve("tests/save/basic-lua.spec.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/save-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("save-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write(
        "存檔 Lua 轉譯失敗。\n" +
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (name) => name,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => "\n",
            }),
    );
    process.exit(1);
}
fs.mkdirSync(".cache", { recursive: true });
fs.writeFileSync(".cache/save-validation.lua", bundle);
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(
    state,
    to_luastring(
        `debug = nil
local checks = (function(...) ${bundle} end)()
assert(checks.verifySave() == 10, '存檔驗證組數錯誤。')
local owner, displayed = {}, false
GetPlayerName = function(...)
  assert(select('#', ...) == 1 and (...) == owner, '玩家名稱收到多餘 self。')
  return 'Alice#1234'
end
DisplayTimedTextToPlayer = function(...)
  assert(select('#', ...) == 5, '顯示函式參數數量錯誤。')
  local player, x, y, duration, text = ...
  assert(player == owner and x == 0 and y == 0 and duration == 30 and text == '存檔驗證', '顯示函式參數錯誤。')
  displayed = true
end
assert(checks.wc3PlayerNatives:playerName(owner) == 'Alice#1234', '正式名稱介面錯誤。')
checks.wc3PlayerNatives:display(owner, '存檔驗證')
assert(displayed, '正式顯示介面未呼叫。')`,
    ),
);
if (status !== lua.LUA_OK) {
    if (lua.lua_type(state, -1) === lua.LUA_TTABLE)
        lua.lua_getfield(state, -1, to_luastring("message"));
    const message = lua.lua_tostring(state, -1);
    process.stderr.write((message ? to_jsstring(message) : "存檔 Lua 驗證失敗。") + "\n");
    process.exitCode = 1;
} else
    process.stdout.write(
        "存檔 Lua 5.3：11 組通過，0 組失敗（共用流程 10 組，正式原生介面 1 組）。\n",
    );
