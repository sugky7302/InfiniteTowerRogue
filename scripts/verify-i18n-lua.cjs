const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const tstl = require("typescript-to-lua");
const { toLua } = require("./i18n-objects.cjs");
// 使用專案既有的 Fengari，不新增套件。
const {
    lua,
    lauxlib,
    lualib,
    to_luastring,
    to_jsstring,
} = require("../node_modules/.pnpm/fengari@0.1.5/node_modules/fengari");
const parsed = tstl.parseConfigFileWithSystem("tsconfig.rxwc3.json");
const fixture = path.resolve("tests/i18n/i18n-lua.spec.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/i18n-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("i18n-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write("多語言 Lua 驗證程式轉譯失敗。\n");
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
fs.writeFileSync(".cache/i18n-validation.lua", bundle);
const checks = `
local serialized = ${toLua({ text: '甲"乙\\丙\n\u00001', list: [1, 2] })}
assert(serialized.text == '甲"乙\\\\丙\\n\\0001' and serialized.list[2] == 2, '建置翻譯資料的跳脫或陣列錯誤')
local validation = (function(...) ${bundle} end)()
assert(validation.verifyI18n() == 7, '多語言驗證組數錯誤')
local calls = {}
local function record(name)
  return function(...)
    calls[#calls + 1] = {name, ...}
  end
end
for _, name in ipairs({
  'BlzSetAbilityTooltip', 'BlzSetAbilityExtendedTooltip', 'BlzSetAbilityActivatedTooltip',
  'BlzSetAbilityActivatedExtendedTooltip', 'BlzSetAbilityResearchTooltip', 'BlzSetAbilityResearchExtendedTooltip',
  'BlzSetItemName', 'BlzSetItemTooltip', 'BlzSetItemExtendedTooltip', 'BlzSetItemDescription',
  'BlzSetUnitName', 'BlzSetHeroProperName'
}) do _G[name] = record(name) end
-- 文字套用期間若建立原生 handle，立即失敗。
CreateTrigger = function() error('本地文字流程建立了觸發器') end
CreateGroup = function() error('本地文字流程建立了群組') end
GetWorldBounds = function() error('本地文字流程建立了區域') end
BlzGetLocale = function(...) assert(select('#', ...) == 0); return 'EN-us' end
local n = validation.natives
assert(n:getLocale() == 'EN-us', '正式語言讀取錯誤')
assert(validation.t('example.greeting', {name = '旅人'}) == 'Hello, 旅人.', '公開翻譯函式錯誤')
validation.getI18n().language.set('zh-CN')
assert(validation.t('example.ready') == '多语言示例已启动。', '公開翻譯函式沒有切換語言')
for _, field in ipairs({'tip', 'ubertip', 'untip', 'unubertip', 'researchtip', 'researchubertip'}) do
  n:abilityText(1093683505, field, 1, '技能文字')
end
for i = 1, 6 do
  assert(#calls[i] == 4 and calls[i][2] == 1093683505 and calls[i][3] == '技能文字' and calls[i][4] == 1,
    '技能文字原生函式參數錯誤')
end
local target = {}
for _, field in ipairs({'name', 'tip', 'ubertip', 'description'}) do n:itemText(target, field, '物品文字') end
n:unitName(target, '單位文字')
n:heroName(target, '英雄文字')
assert(#calls == 12 and calls[7][1] == 'BlzSetItemName' and calls[10][1] == 'BlzSetItemDescription'
  and calls[11][1] == 'BlzSetUnitName' and calls[12][1] == 'BlzSetHeroProperName', '原生函式路由錯誤')
for i = 7, 12 do assert(#calls[i] == 3 and calls[i][2] == target, '原生函式收到多餘的 self') end
`;
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(state, to_luastring(checks));
if (status !== lua.LUA_OK) {
    process.stderr.write(to_jsstring(lauxlib.luaL_tolstring(state, -1)) + "\n");
    process.exitCode = 1;
} else {
    process.stdout.write(
        "多語言 Lua 5.3 驗證：11 組通過，0 組失敗（共用流程 7 組、建置字面表 1 組、公開翻譯 1 組、語言讀取 1 組、12 個文字設定原生函式 1 組）。\n",
    );
    process.stdout.write(
        "Fengari 使用 32 位元整數與 64 位元浮點數。遊戲內字型與多人安全性仍待驗證。\n",
    );
}
