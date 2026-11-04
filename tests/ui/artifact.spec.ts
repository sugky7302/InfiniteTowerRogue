import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

const { parsers } = require("mdx-m3-viewer-th");
const config = JSON.parse(readFileSync("config.json", "utf8"));
const map = new War3Map();
map.load(new Uint8Array(readFileSync(path.join(config.outputFolder, config.mapFolder))).buffer);
let count = 0;
function verify(action: () => void): void {
    action();
    count++;
}
verify(() => {
    for (const name of ["infinite-tower-rogue.toc", "inventory.fdf"]) {
        const source = readFileSync(path.join("assets/ui", name));
        const archive = map.archive.get("ui\\" + name);
        assert.ok(archive, "封裝缺少 UI 檔案：" + name);
        assert.deepEqual(Buffer.from(archive.bytes()), source);
        assert.deepEqual(readFileSync(path.join("dist", config.mapFolder, "ui", name)), source);
    }
});
const toc = map.archive.get("ui\\infinite-tower-rogue.toc")!.text();
verify(() => {
    assert.ok(toc.endsWith("\r\n\r\n"), "主 TOC 必須以空行結尾。");
    assert.ok(!/(?<!\r)\n|\r(?!\n)/.test(toc), "主 TOC 只能使用 CRLF。");
    const entries = toc.split("\r\n").filter((line) => line.length > 0);
    assert.ok(entries.includes("ui\\inventory.fdf"));
    for (const entry of entries)
        assert.ok(map.archive.get(entry), "主 TOC 的 FDF 不存在：" + entry);
});
const fdf = map.archive.get("ui\\inventory.fdf")!.text();
verify(() => {
    const templates = [
        ["BACKDROP", "ItrPanel"],
        ["GLUEBUTTON", "ItrSlotButton"],
        ["GLUETEXTBUTTON", "ItrTabButton"],
        ["GLUETEXTBUTTON", "ItrActionButton"],
        ["TEXT", "ItrTitleText"],
        ["TEXT", "ItrBodyText"],
        ["FRAME", "ItrStatLine"],
        ["SPRITE", "ItrModelPreview"],
        ["FRAME", "ItrInventoryRoot"],
        ["BACKDROP", "ItrHeroPanel"],
        ["BACKDROP", "ItrStatsPanel"],
        ["BACKDROP", "ItrBagPanel"],
        ["BACKDROP", "ItrDescriptionPanel"],
        ["TEXT", "ItrSectionTitle"],
        ["TEXT", "ItrSlotLabel"],
        ["TEXT", "ItrDescriptionText"],
        ["TEXT", "ItrResultText"],
    ];
    for (const [type, name] of templates)
        assert.ok(fdf.includes('Frame "' + type + '" "' + name + '"'));
    for (const child of ["ItrSlotIcon", "ItrSlotSelection", "ItrStatName", "ItrStatValue"])
        assert.ok(fdf.includes('"' + child + '"'));
});
verify(() => {
    for (const block of fdf.matchAll(/Frame "TEXT" "[^"]+" \{([^}]+)\}/g))
        for (const property of [
            "DecorateFileNames",
            "FrameFont",
            "FontColor",
            "FontJustificationH",
            "FontJustificationV",
        ])
            assert.ok(block[1].includes(property), "文字樣板缺少：" + property);
    assert.ok(fdf.includes('"ItrDescriptionText" INHERITS "ItrBodyText"'));
});
verify(() => {
    const folder = path.join("dist", config.mapFolder, "ui");
    const names = readdirSync(folder).filter((name) => name.startsWith("itr-hero-preview"));
    assert.deepEqual(names, ["itr-hero-preview.mdx"]);
    for (const name of names) {
        const archive = map.archive.get("ui\\" + name);
        assert.ok(archive, "封裝缺少預覽模型：" + name);
        assert.deepEqual(Buffer.from(archive.bytes()), readFileSync(path.join(folder, name)));
        const model = new parsers.mdlx.Model();
        model.load(archive.bytes());
        assert.equal(model.helpers.length, 1);
        assert.equal(model.attachments.length, 1);
        assert.equal(model.attachments[0].path, "units\\human\\HeroArchMage\\HeroArchMage.mdx");
    }
});
const script = map.archive.get("war3map.lua")!.text();
verify(() => {
    assert.equal(script, readFileSync(path.join("dist", config.mapFolder, "war3map.lua"), "utf8"));
    assert.ok(!/2\s*\^\s*1024/.test(script));
});
verify(() => {
    for (const command of ["-bag", "-drop", "-bag-swap", "-items", "-equip", "-unequip"])
        assert.ok(script.includes('"' + command + '"'));
    assert.ok(script.includes("runInventoryUi") && script.includes("BlzTriggerRegisterFrameEvent"));
    assert.ok(script.includes("inventoryTransition") && script.includes("inventoryDescription"));
});
verify(() => {
    assert.ok(!script.includes("runUiExperiment"));
    assert.ok(!map.archive.get("ui\\itr-probe.fdf"));
    assert.ok(!map.archive.get("ui\\itr-probe-no-trailing.toc"));
    assert.ok(!map.archive.get("ui\\itr-hero-preview-inv.mdx"));
});
console.log(`I4 UI 地圖產物：${count} 組通過，0 組失敗。`);
