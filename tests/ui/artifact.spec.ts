import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const map = new War3Map();
map.load(new Uint8Array(readFileSync(path.join(config.outputFolder, config.mapFolder))).buffer);
const files = [
    "infinite-tower-rogue.toc",
    "inventory.fdf",
    "itr-probe-no-trailing.toc",
    "itr-probe.fdf",
];
for (const name of files) {
    const source = readFileSync(path.join("assets/ui", name));
    const archive = map.archive.get("ui\\" + name);
    assert.ok(archive, "封裝缺少 UI 檔案：" + name);
    assert.deepEqual(Buffer.from(archive.bytes()), source);
    assert.deepEqual(readFileSync(path.join("dist", config.mapFolder, "ui", name)), source);
}
const toc = map.archive.get("ui\\infinite-tower-rogue.toc")!.text();
assert.ok(toc.endsWith("\r\n\r\n"), "主 TOC 必須以空行結尾。");
assert.ok(!/(?<!\r)\n|\r(?!\n)/.test(toc), "主 TOC 只能使用 CRLF。");
const entries = toc.split("\r\n").filter((line) => line.length > 0);
assert.ok(entries.includes("ui\\inventory.fdf"));
assert.ok(!entries.includes("ui\\itr-probe.fdf"), "探測樣板不得由主 TOC 載入。");
for (const entry of entries) assert.ok(map.archive.get(entry), "主 TOC 的 FDF 不存在：" + entry);
const probeToc = map.archive.get("ui\\itr-probe-no-trailing.toc")!.text();
assert.equal(probeToc, "ui\\itr-probe.fdf");
assert.ok(!/[\r\n]$/.test(probeToc), "探測 TOC 不得有結尾換行。");
assert.ok(map.archive.get(probeToc));
const fdf = map.archive.get("ui\\inventory.fdf")!.text();
const templates = [
    ["BACKDROP", "ItrPanel"],
    ["GLUEBUTTON", "ItrSlotButton"],
    ["GLUETEXTBUTTON", "ItrTabButton"],
    ["GLUETEXTBUTTON", "ItrActionButton"],
    ["TEXT", "ItrTitleText"],
    ["TEXT", "ItrBodyText"],
    ["FRAME", "ItrStatLine"],
    ["SPRITE", "ItrModelPreview"],
];
for (const [type, name] of templates)
    assert.ok(fdf.includes('Frame "' + type + '" "' + name + '"'));
for (const child of ["ItrSlotIcon", "ItrStatName", "ItrStatValue"])
    assert.ok(fdf.includes('"' + child + '"'));
const probeFdf = map.archive.get("ui\\itr-probe.fdf")!.text();
assert.equal((probeFdf.match(/Frame "/g) ?? []).length, 1);
assert.ok(probeFdf.includes('Frame "TEXT" "ItrProbeText"'));
for (const source of [fdf, probeFdf]) {
    for (const block of source.matchAll(/Frame "TEXT" "[^"]+" \{([^}]+)\}/g)) {
        for (const property of [
            "DecorateFileNames",
            "FrameFont",
            "FontColor",
            "FontJustificationH",
            "FontJustificationV",
        ])
            assert.ok(block[1].includes(property), "文字樣板缺少：" + property);
    }
}
const script = map.archive.get("war3map.lua")!.text();
assert.equal(script, readFileSync(path.join("dist", config.mapFolder, "war3map.lua"), "utf8"));
assert.ok(!/2\s*\^\s*1024/.test(script));
for (const command of [
    "-ui-toc",
    "-ui-show",
    "-ui-hide",
    "-ui-model",
    "-ui-anim",
    "-ui-select",
    "-ui-stop",
])
    assert.ok(script.includes('"' + command + '"'));
assert.ok(script.includes("BlzTriggerRegisterFrameEvent"));
assert.ok(script.includes("runUiExperiment(hero, skillHeroModel)"));
console.log("I3 UI 地圖產物：8 組通過，0 組失敗。");
