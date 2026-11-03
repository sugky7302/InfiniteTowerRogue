const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const tstl = require("typescript-to-lua");
// 使用專案已安裝的 Lua 5.3 虛擬機，不新增套件。
const {
    lua,
    lauxlib,
    lualib,
    to_luastring,
    to_jsstring,
} = require("../node_modules/.pnpm/fengari@0.1.5/node_modules/fengari");
const parsed = tstl.parseConfigFileWithSystem("tsconfig.rxwc3.json");
const fixture = path.resolve("tests/rxwc3/benchmark-lua.spec.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/benchmark-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("benchmark-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write("基準 Lua 驗證程式轉譯失敗。\n");
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
fs.writeFileSync(".cache/benchmark-validation.lua", bundle);
const p3Fixture = path.resolve("tests/rxwc3/benchmark-p3-lua.spec.ts");
let p3Bundle;
const p3Result = tstl.transpileFiles(
    [p3Fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/benchmark-p3-validation.lua",
        luaBundleEntry: p3Fixture,
    },
    (filename, content) => {
        if (filename.endsWith("benchmark-p3-validation.lua")) p3Bundle = content;
    },
);
if (p3Result.diagnostics.length || !p3Bundle) {
    process.stderr.write("P3 Lua 驗證程式轉譯失敗。\n");
    process.stderr.write(
        ts.formatDiagnosticsWithColorAndContext(p3Result.diagnostics, {
            getCanonicalFileName: (name) => name,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => "\n",
        }),
    );
    process.exit(1);
}
fs.writeFileSync(".cache/benchmark-p3-validation.lua", p3Bundle);
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const checks = `debug = nil
local validation = (function(...) ${bundle} end)()
assert(validation.verifyBenchmark() == 11, '基準驗證組數錯誤')
local originalPcall = pcall
local protectedCalls = 0
pcall = function(fn, ...)
    protectedCalls = protectedCalls + 1
    return originalPcall(fn, ...)
end
local p3 = (function(...) ${p3Bundle} end)()
assert(p3.verifyBenchmarkP3() == 7, 'P3 驗證組數錯誤')
for _, kind in ipairs({'subject', 'hub'}) do
    local work = p3.createWorkload({id = 'P3', kind = kind, width = 20}, 'rx')
    protectedCalls = 0
    work.step()
    assert(protectedCalls == 20, '每個一般訂閱者必須只保護一次')
    work.dispose()
end
pcall = originalPcall`;
const status = lauxlib.luaL_dostring(state, to_luastring(checks));
if (status !== lua.LUA_OK) {
    // 不把 TSTL Error 轉成字串，避免呼叫遊戲沒有的 debug.getinfo。
    if (lua.lua_type(state, -1) === lua.LUA_TTABLE)
        lua.lua_getfield(state, -1, to_luastring("message"));
    const message = lua.lua_tostring(state, -1);
    process.stderr.write((message ? to_jsstring(message) : "Lua 驗證發生無法讀取的錯誤。") + "\n");
    process.exitCode = 1;
} else
    process.stdout.write(
        "基準 Lua 5.3 驗證：18 組通過，0 組失敗（既有 11 組，P3 新增 7 組）。假的原生介面不能取代遊戲內驗證。\n",
    );
