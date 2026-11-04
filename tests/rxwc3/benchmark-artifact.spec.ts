import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

/** 建置後執行。確認封裝包含基準入口與保留技能。 */
export function verifyBenchmarkArtifact(): void {
    const config = JSON.parse(readFileSync("config.json", "utf8"));
    const directory = `dist/${config.mapFolder}`;
    const bytes = new Uint8Array(readFileSync(`${config.outputFolder}/${config.mapFolder}`));
    const map = new War3Map();
    map.load(bytes.buffer);
    const script = readFileSync(`${directory}/war3map.lua`, "utf8");
    assert.doesNotMatch(script, /2\s*\^\s*1024/);
    assert.match(script, /runBenchmarkExample/);
    assert.equal(map.archive.get("war3map.lua")!.text(), script);
    const ability = map.archive.get("war3map.w3a");
    assert.ok(ability, "封裝缺少檔案通道技能。");
    assert.deepEqual(Buffer.from(ability.bytes()), readFileSync(`${directory}/war3map.w3a`));
    const { loadObjectData } = require("war3-transformer/dist/objectdata");
    const data = loadObjectData(directory);
    assert.ok(data.abilities.has("A0IO"));
    // 每段檔案資料使用一個技能的第 0 級：A0IO、AF01～AF42。
    assert.equal(data.abilities.get("A0IO").levels, 1);
    assert.ok(data.abilities.has("AF01") && data.abilities.has("AF42"));
}

if (require.main === module) {
    verifyBenchmarkArtifact();
    console.log("基準地圖產物驗證通過：入口、封裝與保留技能正確，不支援的數值常數為 0 筆。");
}
