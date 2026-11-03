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

function snapshot(output) {
    const parsed = tstl.parseConfigFileWithSystem("tsconfig.rxwc3.json");
    const entry = path.resolve("src/shared/rxwc3/benchmark/workloads.ts");
    let bundle;
    const result = tstl.transpileFiles(
        [entry],
        {
            ...parsed.options,
            rootDir: process.cwd(),
            outDir: process.cwd(),
            luaBundle: ".cache/bench/workloads.lua",
            luaBundleEntry: entry,
        },
        (name, content) => {
            if (name.endsWith("workloads.lua")) bundle = content;
        },
    );
    const diagnostics = [...parsed.errors, ...result.diagnostics];
    if (diagnostics.length || !bundle)
        throw new Error(
            "基準轉譯失敗。\n" +
                ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                    getCanonicalFileName: (name) => name,
                    getCurrentDirectory: () => process.cwd(),
                    getNewLine: () => "\n",
                }),
        );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bundle);
}

function measure(filename) {
    const bundle = fs.readFileSync(filename, "utf8");
    const state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(state);
    const source = `debug = nil
local workloads = (function(...) ${bundle} end)()
local cases = {
    {id = 'B1-subject-20', kind = 'subject', width = 20},
    {id = 'B1-subject-100', kind = 'subject', width = 100},
    {id = 'B1-hub-20', kind = 'hub', width = 20},
    {id = 'B3-10', kind = 'signal', width = 10},
    {id = 'B3-100', kind = 'signal', width = 100}
}
local rows = {}
for _, spec in ipairs(cases) do
    local samples = {}
    local checksum
    for round = 1, 7 do
        local work = workloads.createWorkload(spec, 'rx')
        local native = workloads.createWorkload(spec, 'native')
        for i = 1, 200 do work.step(); native.step() end
        local start = os.clock()
        for i = 1, 500 do work.step() end
        samples[round] = (os.clock() - start) * 1000
        for i = 1, 500 do native.step() end
        checksum = work.checksum()
        assert(checksum == native.checksum(), '檢查值不同')
        work.dispose(); native.dispose()
    end
    table.sort(samples)
    rows[#rows + 1] = spec.id .. ',' .. samples[4] .. ',' .. checksum
end
return table.concat(rows, '\\n')`;
    try {
        const status = lauxlib.luaL_dostring(state, to_luastring(source));
        if (status !== lua.LUA_OK) {
            if (lua.lua_type(state, -1) === lua.LUA_TTABLE)
                lua.lua_getfield(state, -1, to_luastring("message"));
            const message = lua.lua_tostring(state, -1);
            throw new Error(message ? to_jsstring(message) : "Lua 基準失敗。");
        }
        return to_jsstring(lua.lua_tostring(state, -1))
            .split("\n")
            .map((line) => {
                const [id, ms, checksum] = line.split(",");
                return { id, ms: Number(ms), checksum: Number(checksum) };
            });
    } finally {
        lua.lua_close(state);
    }
}

function main() {
    const [command, first, second] = process.argv.slice(2);
    if (command === "snapshot" && first) {
        snapshot(first);
        process.stdout.write(`已保存 Lua：${first}\n`);
    } else if (command === "compare" && first && second) {
        const before = measure(first);
        const after = measure(second);
        process.stdout.write("項目,優化前毫秒,優化後毫秒,加速倍數,檢查值\n");
        before.forEach((row, index) => {
            const next = after[index];
            if (row.id !== next.id || row.checksum !== next.checksum)
                throw new Error("前後工作負載不同。");
            process.stdout.write(
                `${row.id},${row.ms.toFixed(3)},${next.ms.toFixed(3)},${(row.ms / next.ms).toFixed(3)},${row.checksum}\n`,
            );
        });
        process.stdout.write(
            "每輪暖身 200 次，量測 7 輪，每輪 500 次；使用中位數。只適用於 Fengari 前後比較。\n",
        );
    } else if (command === "inspect" && first) {
        const source = fs.readFileSync(first, "utf8");
        if (/2\s*\^\s*1024/.test(source)) throw new Error("Lua 含有不支援的數字常數。");
        for (const name of [
            "Subject.prototype.next",
            "Subject.prototype.error",
            "Subject.prototype.complete",
            "Subject.prototype.dispatch",
            "Subscriber.prototype.next",
            "Subscriber.prototype.notify",
            "EventHub.prototype.dispatch",
            "____exports.notifyNext",
            "callNext",
        ]) {
            const escaped = name.replaceAll(".", "\\.");
            const match = source.match(
                new RegExp(`^(?:local )?function ${escaped}\\([^\\n]*\\n([\\s\\S]*?)^end$`, "m"),
            );
            if (!match) throw new Error(`找不到 Lua 函式：${name}`);
            if (/\bfunction\b/.test(match[1])) throw new Error(`分發路徑仍建立閉包：${name}`);
            process.stdout.write(`沒有內部閉包：${name}\n`);
        }
        process.stdout.write("不支援的數字常數：0 筆。\n");
    } else
        throw new Error(
            "用法：node scripts/benchmark-lua.cjs snapshot <輸出>、compare <優化前> <優化後> 或 inspect <地圖 Lua>",
        );
}

try {
    main();
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
}
