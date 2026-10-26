import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { ObjectData } from "war3-objectdata-th/dist/cjs";
import W3a from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3d/file";
import ModifiedObject from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/modifiedobject";
import Modification from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/modification";
import Wts from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/wts/file";

const helper = require("../../scripts/i18n-objects.cjs");

function temporary(run: (directory: string) => void): void {
    const root = path.resolve(".cache/i18n-tests");
    fs.mkdirSync(root, { recursive: true });
    const directory = fs.mkdtempSync(path.join(root, "build-"));
    try {
        fs.writeFileSync(
            path.join(directory, "config.json"),
            JSON.stringify({ mapFolder: "map.w3x" }),
        );
        fs.mkdirSync(path.join(directory, "maps/map.w3x"), { recursive: true });
        run(directory);
    } finally {
        assert(directory.startsWith(root + path.sep));
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

test("範本新增鍵使用 null 且不覆蓋既有翻譯", () => {
    const result = helper.mergeTemplate({ old: "原文", added: "新增" }, { old: "譯文" });
    assert.deepEqual(result.template, { old: "譯文", added: null });
    assert.deepEqual(result.missing, ["added"]);
});
test("範本列出刪除鍵且保留舊翻譯", () => {
    const result = helper.mergeTemplate({}, { deleted: "舊翻譯" });
    assert.deepEqual(result.deleted, ["deleted"]);
    assert.equal(result.template.deleted, "舊翻譯");
});
test("範本把 null 與空字串列為未翻譯", () => {
    assert.deepEqual(helper.mergeTemplate({ a: "甲", b: "乙" }, { a: null, b: "" }).missing, [
        "a",
        "b",
    ]);
});
test("空地圖與只讀取內建物件不產生翻譯鍵", () => {
    const data = new ObjectData();
    assert.deepEqual(helper.extractObjects(data), { entries: [], base: {} });
    data.units.get("hfoo");
    data.abilities.get("AHhb");
    data.items.get("ratf");
    assert.deepEqual(helper.extractObjects(data), { entries: [], base: {} });
});
test("修改內建模型不擷取內建名稱，修改名稱才加入", () => {
    const data = new ObjectData();
    const unit = data.units.get("hfoo")!;
    unit.modelFile = "範例模型";
    assert.equal(helper.extractObjects(data).entries.length, 0);
    unit.name = "守衛";
    assert.deepEqual(helper.extractObjects(data).base, { "unit:hfoo:name": "守衛" });
});
test("自訂物件讀取名稱、英雄專有名稱、物品及單位說明", () => {
    const data = new ObjectData();
    const hero = data.units.copy("Hpal", "H001")!;
    hero.name = "英雄";
    hero.properNames = "明光";
    hero.tooltipExtended = "單位說明";
    const item = data.items.copy("ratf", "I001")!;
    item.name = "物品";
    item.tooltipBasic = "說明";
    item.tooltipExtended = "延伸說明";
    item.description = "描述";
    const base = helper.extractObjects(data).base;
    for (const key of [
        "unit:H001:name",
        "unit:H001:properNames",
        "unit:H001:ubertip",
        "item:I001:name",
        "item:I001:tip",
        "item:I001:ubertip",
        "item:I001:description",
    ])
        assert.equal(typeof base[key], "string");
});

function abilityFile(): W3a {
    const file = new W3a();
    const object = new ModifiedObject();
    object.oldId = "AHhb";
    object.newId = "A001";
    for (const id of ["atp1", "aub1", "ahdu"]) {
        for (const level of [1, 2]) {
            const mod = new Modification();
            mod.id = id;
            mod.levelOrVariation = level;
            mod.variableType = id === "ahdu" ? 1 : 3;
            mod.value = id === "ahdu" ? level : `${id} 第 ${level} 級`;
            object.modifications.push(mod);
        }
    }
    file.customTable.objects.push(object);
    return file;
}
test("保留原始技能各級說明與非文字等級欄位", () => {
    const source = { w3a: abilityFile() };
    const data = new ObjectData();
    data.load(source);
    helper.preserveLevels(data, source);
    const saved = data.save().w3a!;
    const reloaded = new W3a();
    reloaded.load(saved.save());
    assert.deepEqual(
        reloaded.customTable.objects[0].modifications.map((mod) => [
            mod.id,
            mod.levelOrVariation,
            mod.value,
        ]),
        source.w3a.customTable.objects[0].modifications.map((mod) => [
            mod.id,
            mod.levelOrVariation,
            mod.value,
        ]),
    );
    const result = helper.extractObjects(data);
    assert.equal(result.base["ability:A001:tip:1"], "atp1 第 1 級");
    assert.equal(result.base["ability:A001:tip:2"], "atp1 第 2 級");
    assert.equal(result.base["ability:A001:ubertip:2"], "aub1 第 2 級");
});
test("建置階段明確修改技能欄位時不還原舊值", () => {
    const source = { w3a: abilityFile() };
    const data = new ObjectData();
    data.load(source);
    data.abilities.get("A001")!.tooltipNormal = "新文字";
    helper.preserveLevels(data, source);
    assert.equal(helper.extractObjects(data).base["ability:A001:tip:1"], "新文字");
});
test("讀取字串表，保留逗號、換行與 WC3 標籤", () => {
    const data = new ObjectData();
    data.units.get("hfoo")!.name = "TRIGSTR_001";
    const strings = new Wts();
    strings.setString(1, "|cffff0000甲,乙|r\n第二行");
    assert.equal(
        helper.extractObjects(data, strings).base["unit:hfoo:name"],
        "|cffff0000甲,乙|r\n第二行",
    );
});
test("字串表缺項時明確失敗，內建字串識別碼不覆寫", () => {
    const data = new ObjectData();
    data.units.get("hfoo")!.name = "TRIGSTR_999";
    assert.throws(() => helper.extractObjects(data), /找不到物件字串/);
    data.units.get("hfoo")!.name = "WESTRING_範例";
    assert.deepEqual(helper.extractObjects(data).base, {});
});
test("空地圖建置產生三個空範本且沒有警告", () =>
    temporary((directory) => {
        const warnings: string[] = [];
        const result = helper.buildTranslations(new ObjectData(), directory, (text: string) =>
            warnings.push(text),
        );
        assert.deepEqual(result.entries, []);
        assert.deepEqual(warnings, []);
        for (const locale of ["zh-TW", "zh-CN", "en-US"]) {
            assert.deepEqual(
                JSON.parse(
                    fs.readFileSync(path.join(directory, "i18n/objects", locale + ".json"), "utf8"),
                ),
                {},
            );
        }
    }));
test("建置合併列出缺少及刪除鍵，執行表只包含有效翻譯", () =>
    temporary((directory) => {
        const data = new ObjectData();
        data.units.get("hfoo")!.name = "守衛";
        const target = path.join(directory, "i18n/objects");
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(
            path.join(target, "en-US.json"),
            JSON.stringify({ "unit:hfoo:name": "Guard", old: "保留" }),
        );
        const warnings: string[] = [];
        const result = helper.buildTranslations(data, directory, (text: string) =>
            warnings.push(text),
        );
        assert.equal(result.tables["en-US"]["unit:hfoo:name"], "Guard");
        assert.equal(result.tables["en-US"].old, undefined);
        assert.deepEqual(result.tables["zh-CN"], {});
        assert(warnings.some((text) => text.includes("尚未翻譯")));
        assert(warnings.some((text) => text.includes("已刪除")));
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(target, "en-US.json"), "utf8")).old,
            "保留",
        );
    }));
test("翻譯檔格式錯誤不被靜默覆蓋", () =>
    temporary((directory) => {
        const target = path.join(directory, "i18n/objects");
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, "en-US.json"), '{"錯誤":5}');
        assert.throws(() => helper.buildTranslations(new ObjectData(), directory), /格式錯誤/);
        assert.equal(fs.readFileSync(path.join(target, "en-US.json"), "utf8"), '{"錯誤":5}');
    }));
test("範例建立技能、物品與英雄，技能含兩級文字且數值在 int32 範圍", () =>
    temporary((directory) => {
        const data = new ObjectData();
        const result = helper.buildExample(data, directory);
        assert(data.abilities.has("A0I1") && data.items.has("I0I1") && data.units.has("H0I1"));
        assert(result.entries.some((entry: { key: string }) => entry.key === "ability:A0I1:tip:2"));
        for (const entry of result.entries) {
            assert(Number.isInteger(entry.id) && entry.id > 0 && entry.id <= 2147483647);
            assert.equal(Math.fround(entry.level), entry.level);
        }
    }));
test("範例拒絕覆蓋地圖已有的相同代碼", () =>
    temporary((directory) => {
        const data = new ObjectData();
        data.units.copy("Hpal", "H0I1");
        assert.throws(() => helper.buildExample(data, directory), /已被使用/);
    }));
test("最終擷取包含較晚修改的文字並把翻譯寫入 Lua", () =>
    temporary((directory) => {
        const data = new ObjectData();
        helper.createExample(data, directory);
        data.units.get("hfoo")!.name = "最後加入的守衛";
        const target = path.join(directory, "dist/map.w3x");
        fs.mkdirSync(target, { recursive: true });
        for (const [key, file] of Object.entries(data.save())) {
            const skin = key.endsWith("Skin");
            const extension = skin ? key.slice(0, -4) : key;
            fs.writeFileSync(
                path.join(target, `war3map${skin ? "Skin" : ""}.${extension}`),
                file!.save(),
            );
        }
        const script = path.join(directory, "dist/tstl_output.lua");
        fs.writeFileSync(script, "原有腳本");
        const result = helper.finalizeTranslations(directory, "map.w3x", script);
        assert.equal(result.tables["zh-TW"]["unit:hfoo:name"], "最後加入的守衛");
        assert(result.entries.some((entry: { key: string }) => entry.key === "ability:A0I1:tip:2"));
        const lua = fs.readFileSync(script, "utf8");
        assert(lua.startsWith("__i18nObjectData = {"));
        assert(lua.endsWith("原有腳本"));
    }));
