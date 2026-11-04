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
const fixture = path.resolve("tests/hero/lua-entry.ts");
let bundle;
const result = tstl.transpileFiles(
    [fixture],
    {
        ...parsed.options,
        rootDir: process.cwd(),
        outDir: process.cwd(),
        luaBundle: ".cache/hero-validation.lua",
        luaBundleEntry: fixture,
    },
    (filename, content) => {
        if (filename.endsWith("hero-validation.lua")) bundle = content;
    },
);
const diagnostics = [...parsed.errors, ...result.diagnostics];
if (diagnostics.length || !bundle) {
    process.stderr.write(
        "英雄 Lua 轉譯失敗。\n" +
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (name) => name,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => "\n",
            }),
    );
    process.exit(1);
}
fs.mkdirSync(".cache", { recursive: true });
fs.writeFileSync(".cache/hero-validation.lua", bundle);
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const status = lauxlib.luaL_dostring(
    state,
    to_luastring(
        `debug = nil
local checks = (function(...) ${bundle} end)()
local count = checks.verifyHero()
assert(count == #checks.heroCases, "英雄驗證組數錯誤。")
local original = checks.heroCases[1].run
checks.heroCases[1].run = function() error({message = "驗證器故障注入。"}) end
local accepted = pcall(checks.verifyHero)
checks.heroCases[1].run = original
assert(not accepted, "英雄驗證器未攔截故障。")
count = count + 1
local natives = checks.wc3ItemCarrierNatives
local hero, handle, trigger = {}, {}, {}
local level, added, removed, destroyed, picked = 0, 0, 0, 0, false
local action
FourCC = function(...)
  assert(select('#', ...) == 1, "物品代碼收到多餘 self。")
  return (...)
end
GetUnitAbilityLevel = function(...)
  local target, code = ...
  assert(select('#', ...) == 2 and target == hero and code == 'AInv', "物品欄查詢參數錯誤。")
  return level
end
UnitAddAbility = function(target, code)
  assert(target == hero and code == 'AInv', "物品欄技能參數錯誤。")
  added = added + 1
end
natives:ensureInventory(hero)
level = 1
natives:ensureInventory(hero)
assert(added == 1, "物品欄技能重複加入。")
CreateItem = function(...)
  local code, x, y = ...
  assert(select('#', ...) == 3 and code == 'I0B1' and x == 120 and y == -80, "建立物品參數錯誤。")
  return handle
end
assert(natives:createItem('I0B1', 120, -80) == handle, "建立物品結果錯誤。")
SetItemUserData = function(target, id) assert(target == handle and id == 94, "物品編號寫入錯誤。") end
GetItemUserData = function(target) assert(target == handle, "物品編號查詢錯誤。") return 94 end
natives:setUserData(handle, 94)
assert(natives:getUserData(handle) == 94, "物品編號結果錯誤。")
SetItemVisible = function(target, value) assert(target == handle and value == false, "物品隱藏錯誤。") end
SetItemPosition = function(target, x, y) assert(target == handle and x == 120 and y == -80, "物品位置錯誤。") end
natives:setVisible(handle, false)
natives:setPosition(handle, 120, -80)
GetUnitX = function(target) assert(target == hero, "單位座標查詢錯誤。") return 120 end
GetUnitY = function(target) assert(target == hero, "單位座標查詢錯誤。") return -80 end
assert(natives:unitX(hero) == 120 and natives:unitY(hero) == -80, "單位座標結果錯誤。")
UnitRemoveItem = function(target, value) assert(target == hero and value == handle, "移出原生物品欄錯誤。") end
natives:removeFromUnit(hero, handle)
CreateTrigger = function(...) assert(select('#', ...) == 0, "觸發器收到多餘 self。") return trigger end
EVENT_UNIT_PICKUP_ITEM = {}
TriggerRegisterUnitEvent = function(value, target, event) assert(value == trigger and target == hero and event == EVENT_UNIT_PICKUP_ITEM, "撿起事件登錄錯誤。") end
TriggerAddAction = function(value, callback) assert(value == trigger, "撿起事件動作錯誤。") action = callback end
GetManipulatedItem = function(...) assert(select('#', ...) == 0, "撿起物品查詢收到多餘 self。") return handle end
DestroyTrigger = function(value) assert(value == trigger, "移除撿起事件錯誤。") destroyed = destroyed + 1 end
local stop = natives:onPickup(hero, function(...) assert(select('#', ...) == 1 and (...) == handle, "撿起回呼收到多餘 self。") picked = true end)
action()
stop()
assert(picked and destroyed == 1, "撿起事件生命週期錯誤。")
RemoveItem = function(target) assert(target == handle, "移除物品參數錯誤。") removed = removed + 1 end
natives:removeItem(handle)
assert(removed == 1, "移除物品結果錯誤。")
count = count + 1
return count`,
    ),
);
if (status !== lua.LUA_OK) {
    if (lua.lua_type(state, -1) === lua.LUA_TTABLE)
        lua.lua_getfield(state, -1, to_luastring("message"));
    const message = lua.lua_tostring(state, -1);
    process.stderr.write((message ? to_jsstring(message) : "英雄 Lua 驗證失敗。") + "\n");
    process.exitCode = 1;
} else process.stdout.write(`英雄 Lua 5.3：${lua.lua_tointeger(state, -1)} 組通過，0 組失敗。\n`);
