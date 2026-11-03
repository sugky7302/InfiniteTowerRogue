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
const fixture = path.resolve("tests/skill/basic-lua.spec.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/skill-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("skill-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write(
        "技能 Lua 轉譯失敗。\n" +
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (name) => name,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => "\n",
            }),
    );
    process.exit(1);
}
fs.mkdirSync(".cache", { recursive: true });
fs.writeFileSync(".cache/skill-validation.lua", bundle);
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(
    state,
    to_luastring(
        `debug = nil\nlocal checks = (function(...) ${bundle} end)()\nassert(checks.verifySkill() == 16, '技能驗證組數錯誤。')`,
    ),
);
if (status !== lua.LUA_OK) {
    if (lua.lua_type(state, -1) === lua.LUA_TTABLE)
        lua.lua_getfield(state, -1, to_luastring("message"));
    const message = lua.lua_tostring(state, -1);
    process.stderr.write((message ? to_jsstring(message) : "技能 Lua 驗證失敗。") + "\n");
    process.exitCode = 1;
} else process.stdout.write("技能 Lua 5.3：16 組通過，0 組失敗。\n");
