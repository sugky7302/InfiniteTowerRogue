import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import type Model from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";

const { parsers } = require("mdx-m3-viewer-th");
const { buildPreviewHero } = require("../../scripts/preview-model.cjs") as {
    buildPreviewHero: (bytes: Uint8Array, options: { unshaded: boolean }) => Uint8Array;
};
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
const heroSource = path.join("assets", "models", "hero-archmage.mdx");
const hasHeroSource = existsSync(heroSource);
const heroCopyName = "itr-hero-archmage-unshaded.mdx";
const heroCopyPath = "ui\\" + heroCopyName;

function teamGlowCount(model: Model): number {
    return model.geosets.filter((geoset) => {
        const layers = model.materials[geoset.materialId].layers;
        return (
            layers.length > 0 &&
            layers.every((layer) => model.textures[layer.textureId].replaceableId === 2)
        );
    }).length;
}

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
        assert.equal(
            model.attachments[0].path,
            hasHeroSource ? heroCopyPath : "units\\human\\HeroArchMage\\HeroArchMage.mdx",
            "包裝模型的附件路徑應符合來源檔案是否存在。",
        );
    }
});
verify(() => {
    const copyFile = path.join("dist", config.mapFolder, "ui", heroCopyName);
    const archive = map.archive.get(heroCopyPath);
    if (!hasHeroSource) {
        assert.equal(existsSync(copyFile), false, "沒有來源時，建置資料夾不得有英雄複本。");
        assert.ok(!archive, "沒有來源時，封裝不得有英雄複本。");
        return;
    }

    assert.ok(existsSync(copyFile), "有來源時，建置資料夾應有英雄複本。");
    assert.ok(archive, "有來源時，封裝應有英雄複本。");
    const copyBytes = readFileSync(copyFile);
    assert.deepEqual(Buffer.from(archive.bytes()), copyBytes, "封裝與建置資料夾的複本應相同。");
    const model: Model = new parsers.mdlx.Model();
    model.load(archive.bytes());
    for (const field of [
        "particleEmitters",
        "particleEmitters2",
        "particleEmittersPopcorn",
        "ribbonEmitters",
        "eventObjects",
    ] as const) {
        assert.equal(model[field].length, 0, `英雄複本的 ${field} 數量應為 0。`);
    }

    const sourceBytes = readFileSync(heroSource);
    const source: Model = new parsers.mdlx.Model();
    source.load(sourceBytes);
    assert.equal(teamGlowCount(model), 0, "英雄複本不得包含隊伍光暈幾何。");
    assert.equal(
        model.geosets.length,
        source.geosets.length - teamGlowCount(source),
        "英雄複本的幾何數量應等於來源數量減去來源的隊伍光暈幾何數量。",
    );
    for (const field of [
        "bones",
        "helpers",
        "attachments",
        "materials",
        "textures",
        "sequences",
    ] as const) {
        assert.equal(
            model[field].length,
            source[field].length,
            `英雄複本的 ${field} 數量應與來源相同。`,
        );
    }

    // 產物檢查假設測試與建置使用相同的 ITR_PREVIEW_UNSHADED 值。
    const unshaded = process.env.ITR_PREVIEW_UNSHADED !== "0";
    model.materials.forEach((material, materialIndex) => {
        const sourceLayers = source.materials[materialIndex].layers;
        assert.equal(material.layers.length, sourceLayers.length, "複本的圖層數量應與來源相同。");
        material.layers.forEach((layer, layerIndex) => {
            const message = `材質 ${materialIndex} 的圖層 ${layerIndex}`;
            if (unshaded) {
                assert.notEqual(layer.flags & 0x1, 0, `${message} 應有不受光照旗標。`);
            } else {
                assert.equal(
                    layer.flags,
                    sourceLayers[layerIndex].flags,
                    `${message} 的旗標應與來源相同。`,
                );
            }
        });
    });
    assert.deepEqual(
        copyBytes,
        Buffer.from(buildPreviewHero(sourceBytes, { unshaded })),
        "英雄複本的位元組應等於相同環境變數下 buildPreviewHero 的結果。",
    );
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
