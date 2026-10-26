import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";
import Wts from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/wts/file";

/** 建置後執行。直接開啟 MPQ，不能用 dist 的資料夾代替封裝驗證。 */
export function verifyI18nArtifact(): number {
    const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
    const directory = path.resolve("dist", config.mapFolder);
    const bytes = new Uint8Array(
        fs.readFileSync(path.resolve(config.outputFolder, config.mapFolder)),
    );
    const map = new War3Map();
    map.load(bytes.buffer);
    const tables: Wts[] = [];
    for (const code of ["zhTW", "zhCN", "enUS"]) {
        const name = ["_Locales", code + ".w3mod", "war3map.wts"].join("\\");
        const file = map.archive.get(name);
        assert(file, `封裝缺少語言字串檔：${code}`);
        const contents = fs.readFileSync(
            path.join(directory, "_Locales", code + ".w3mod", "war3map.wts"),
            "utf8",
        );
        assert.equal(file.text(), contents, `封裝的語言字串檔與建置輸出不同：${code}`);
        const table = new Wts();
        table.load(contents);
        tables.push(table);
    }
    assert.deepEqual([...tables[0].stringMap.keys()], [...tables[1].stringMap.keys()]);
    assert.deepEqual([...tables[0].stringMap.keys()], [...tables[2].stringMap.keys()]);
    assert.equal(
        map.archive.get("war3map.wts")!.text(),
        map.archive.get("_Locales\\zhTW.w3mod\\war3map.wts")!.text(),
    );
    for (const [table, title] of tables.map(
        (table, index) => [table, ["無盡高塔", "无尽高塔", "Infinite Tower"][index]] as const,
    )) {
        assert([...table.stringMap.values()].includes(title));
    }
    const script = fs.readFileSync(path.join(directory, "war3map.lua"), "utf8");
    assert(!/2\s*\^\s*1024/.test(script), "建置 Lua 含有不支援的數值常數。");
    assert.equal(map.archive.get("war3map.lua")!.text(), script);
    const info = fs.readFileSync(path.join(directory, "war3map.w3i"));
    assert.deepEqual(Buffer.from(map.archive.get("war3map.w3i")!.bytes()), info);
    return 8;
}

if (require.main === module) {
    verifyI18nArtifact();
    console.log(
        "i18n 地圖產物驗證：8 組通過，0 組失敗。三種語言檔已封裝；不支援的數值常數為 0 筆。",
    );
}
