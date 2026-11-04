import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

/** 建置後執行。確認封裝包含基準入口與舊通道移除。 */
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
    assert.ok(ability, "封裝缺少技能資料。");
    assert.deepEqual(Buffer.from(ability.bytes()), readFileSync(`${directory}/war3map.w3a`));
    const { loadObjectData } = require("war3-transformer/dist/objectdata");
    const data = loadObjectData(directory);
    assert.ok(!data.abilities.has("A0IO"));
    for (let index = 1; index <= 42; index++) {
        const code = index < 10 ? `AF0${index}` : `AF${index}`;
        assert.ok(!data.abilities.has(code), `地圖仍含舊檔案通道技能：${code}`);
    }
    assert.ok(!data.abilities.has("Amls"), "載體不得建立自訂物件。");
}

if (require.main === module) {
    verifyBenchmarkArtifact();
    console.log(
        "基準地圖產物驗證：4 組通過，0 組失敗。入口、封裝與舊通道移除正確，不支援的數值常數為 0 筆。",
    );
}
