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
const fixture = path.resolve("tests/combat/lua-entry.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/combat-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("combat-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write(
        "戰鬥 Lua 轉譯失敗。\n" +
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (name) => name,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => "\n",
            }),
    );
    process.exit(1);
}
fs.mkdirSync(".cache", { recursive: true });
fs.writeFileSync(".cache/combat-validation.lua", bundle);
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(
    state,
    to_luastring(
        `debug = nil
local checks = (function(...) ${bundle} end)()
local count = checks.verifyCombat() + checks.verifyCombatIntegration()
assert(count == #checks.combatCases + #checks.integrationCases, "戰鬥驗證組數錯誤。")
local original = checks.integrationCases[1].run
checks.integrationCases[1].run = function() error({message = "驗證器故障注入。"}) end
local accepted = pcall(checks.verifyCombatIntegration)
checks.integrationCases[1].run = original
assert(not accepted, "戰鬥驗證器未攔截故障。")
count = count + 1
return count`,
    ),
);
if (status !== lua.LUA_OK) {
    if (lua.lua_type(state, -1) === lua.LUA_TTABLE)
        lua.lua_getfield(state, -1, to_luastring("message"));
    const message = lua.lua_tostring(state, -1);
    process.stderr.write((message ? to_jsstring(message) : "戰鬥 Lua 驗證失敗。") + "\n");
    process.exitCode = 1;
} else process.stdout.write(`戰鬥 Lua 5.3：${lua.lua_tointeger(state, -1)} 組通過，0 組失敗。\n`);
