import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { ObjectData } from "war3-objectdata-th/dist/cjs";
import Wts from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/wts/file";
const objects = require("../../scripts/i18n-objects.cjs");
const locales = require("../../scripts/i18n-locales.cjs");

function fixture(run: (root: string, translations: any) => void): void {
    const cache = path.resolve(".cache/i4-locales");
    fs.mkdirSync(cache, { recursive: true });
    const root = fs.mkdtempSync(path.join(cache, "map-"));
    try {
        const original = path.join(root, "maps/map.w3x");
        const output = path.join(root, "dist/map.w3x");
        fs.mkdirSync(original, { recursive: true });
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(root, "config.json"), JSON.stringify({ mapFolder: "map.w3x" }));
        for (const name of ["war3map.w3i", "war3map.wts", "war3map.lua"]) {
            fs.copyFileSync(path.resolve("maps/map.w3x", name), path.join(original, name));
            fs.copyFileSync(path.join(original, name), path.join(output, name));
        }
        const data = new ObjectData();
        objects.createExample(data, root);
        for (const [key, file] of Object.entries(data.save())) {
            const skin = key.endsWith("Skin");
            fs.writeFileSync(
                path.join(output, `war3map${skin ? "Skin" : ""}.${key.slice(0, 3)}`),
                Buffer.from((file as any).save()),
            );
        }
        const directory = path.join(root, "i18n/objects");
        fs.mkdirSync(directory, { recursive: true });
        for (const code of ["zh-TW", "zh-CN", "en-US"])
            fs.copyFileSync(
                path.resolve("i18n/objects", code + ".json"),
                path.join(directory, code + ".json"),
            );
        const maps = path.join(root, "i18n/map");
        fs.mkdirSync(maps, { recursive: true });
        for (const code of ["zh-TW", "zh-CN", "en-US"])
            fs.copyFileSync(
                path.resolve("i18n/map", code + ".json"),
                path.join(maps, code + ".json"),
            );
        run(
            root,
            objects.buildTranslations(data, root, () => {}),
        );
    } finally {
        assert(root.startsWith(cache + path.sep));
        fs.rmSync(root, { recursive: true, force: true });
    }
}
function wts(root: string, code?: string): Wts {
    const file = new Wts();
    file.load(
        fs.readFileSync(
            path.join(
                root,
                "dist/map.w3x",
                code ? `_Locales/${code}.w3mod/war3map.wts` : "war3map.wts",
            ),
            "utf8",
        ),
    );
    return file;
}

test("自動層產生三種語言且全部參照編號一致", () =>
    fixture((root, translations) => {
        const result = locales.buildLocales(root, "map.w3x", translations);
        const files = ["zhTW", "zhCN", "enUS"].map((code) => wts(root, code));
        assert.deepEqual([...files[0].stringMap.keys()], [...files[1].stringMap.keys()]);
        assert.deepEqual([...files[0].stringMap.keys()], [...files[2].stringMap.keys()]);
        assert.equal(
            files[0].getString(result.references["unit:H0I1:description"]),
            "多語言範例英雄。",
        );
        assert.equal(files[1].getString(result.references["ability:A0I1:name"]), "语言之光");
        assert.equal(
            files[2].getString(result.references["ability:A0I1:name"]),
            "Light of Language",
        );
        assert.deepEqual(wts(root).stringMap, files[0].stringMap);
        assert.equal(wts(root).getString(5), "Player 1");
    }));
test("自動層缺少物件翻譯時沿用基準文字與 I2 警告", () =>
    fixture((root, translations) => {
        const filename = path.join(root, "i18n/objects/en-US.json");
        const table = JSON.parse(fs.readFileSync(filename, "utf8"));
        delete table["ability:A0I1:name"];
        fs.writeFileSync(filename, JSON.stringify(table));
        const source = objects.readMap(path.join(root, "dist/map.w3x"));
        const data = new ObjectData();
        data.load(source);
        objects.preserveLevels(data, source);
        const warnings: string[] = [];
        const rebuilt = objects.buildTranslations(data, root, (text: string) =>
            warnings.push(text),
        );
        assert(
            warnings.some(
                (text) => text.includes("en-US 尚未翻譯") && text.includes("ability:A0I1:name"),
            ),
        );
        const result = locales.buildLocales(root, "map.w3x", rebuilt);
        assert.equal(
            wts(root, "enUS").getString(result.references["ability:A0I1:name"]),
            "語言之光",
        );
    }));
test("物件一般檔與 Skin 檔全部文字使用相同參照且保留技能等級", () =>
    fixture((root, translations) => {
        const result = locales.buildLocales(root, "map.w3x", translations);
        const files = objects.readMap(path.join(root, "dist/map.w3x"));
        let count = 0;
        for (const [kind, ext] of [
            ["unit", "w3u"],
            ["item", "w3t"],
            ["ability", "w3a"],
        ]) {
            for (const fileKey of [ext, ext + "Skin"])
                for (const object of objects.objects(files[fileKey])) {
                    for (const mod of object.modifications) {
                        const field = objects.fields[kind][mod.id];
                        if (
                            !field ||
                            typeof mod.value !== "string" ||
                            mod.value.startsWith("WESTRING_")
                        )
                            continue;
                        const level =
                            kind === "ability" && field !== "name"
                                ? Math.max(1, mod.levelOrVariation)
                                : 0;
                        const key = `${kind}:${objects.codeOf(object)}:${field}${level ? ":" + level : ""}`;
                        assert.equal(mod.value, result.references[key]);
                        count++;
                    }
                }
        }
        assert(count >= 16);
        assert.equal(translations.tables["zh-TW"]["ability:A0I1:tip:2"], "語言之光：第 2 級");
    }));
test("W3I 名稱與載入文字由地圖翻譯檔提供且 config 同步更新參照", () =>
    fixture((root, translations) => {
        const result = locales.buildLocales(root, "map.w3x", translations);
        const slots = locales.mapTextSlots(
            fs.readFileSync(path.join(root, "dist/map.w3x/war3map.w3i")),
        );
        for (const slot of slots) {
            const base = JSON.parse(
                fs.readFileSync(path.join(root, "i18n/map/zh-TW.json"), "utf8"),
            );
            assert.equal(slot.value, base[slot.key] === "" ? "" : result.mapReferences[slot.key]);
        }
        assert.equal(wts(root, "enUS").getString(result.mapReferences.name), "Infinite Tower");
        assert.equal(
            wts(root, "zhCN").getString(result.mapReferences.loadingScreenTitle),
            "无尽高塔",
        );
        const lua = fs.readFileSync(path.join(root, "dist/map.w3x/war3map.lua"), "utf8");
        assert(lua.includes(`SetMapName("${result.mapReferences.name}")`));
        assert(lua.includes(`SetMapDescription("${result.mapReferences.description}")`));
    }));
test("W3I 第 39 版的非文字區段逐位元組保留", () =>
    fixture((root, translations) => {
        const before = fs.readFileSync(path.join(root, "dist/map.w3x/war3map.w3i"));
        locales.buildLocales(root, "map.w3x", translations);
        const after = fs.readFileSync(path.join(root, "dist/map.w3x/war3map.w3i"));
        const a = locales.mapTextSlots(before),
            b = locales.mapTextSlots(after);
        let startA = 0,
            startB = 0;
        for (let i = 0; i < a.length; i++) {
            assert.deepEqual(
                after.subarray(startB, b[i].start),
                before.subarray(startA, a[i].start),
            );
            startA = a[i].end;
            startB = b[i].end;
        }
        assert.deepEqual(after.subarray(startB), before.subarray(startA));
    }));
test("W3I 第 39 版在載入畫面編號後跳過 4 位元組整數，且改寫後霧設定不變", () =>
    fixture((root, translations) => {
        // 不依賴 mapTextSlots：以原始地圖實測的固定位移檢查。2026-10-26 曾因少跳 4 位元組，
        // 把字串寫進此整數，使 WC3 無法載入地圖；比較前後區段的測試無法發現此錯誤。
        const original = fs.readFileSync(path.join(root, "dist/map.w3x/war3map.w3i"));
        assert.equal(original.readInt32LE(141), 64);
        const slots = locales.mapTextSlots(original);
        assert.equal(slots.find((slot: { key: string }) => slot.key === "loadingScreenText").start, 146);
        const fog = (buffer: Buffer, cursor: number) => [
            buffer.readInt32LE(cursor),
            buffer.readFloatLE(cursor + 4),
            buffer.readFloatLE(cursor + 8),
            buffer.readFloatLE(cursor + 12),
        ];
        assert.deepEqual(fog(original, 157), [0, 3000, 5000, 0.5]);
        locales.buildLocales(root, "map.w3x", translations);
        const after = fs.readFileSync(path.join(root, "dist/map.w3x/war3map.w3i"));
        const grown = after.length - original.length;
        assert.deepEqual(fog(after, 157 + grown), [0, 3000, 5000, 0.5]);
        // 欄位位置錯誤時停止，不寫出損壞的檔案。
        const shifted = Buffer.concat([original.subarray(0, 141), original.subarray(145)]);
        assert.throws(() => locales.mapTextSlots(shifted), /結構不符/);
    }));
test("缺少地圖翻譯時警告並使用正體，空白欄位保持空白", () =>
    fixture((root, translations) => {
        fs.writeFileSync(
            path.join(root, "i18n/map/en-US.json"),
            JSON.stringify({ name: null, description: "" }),
        );
        const warnings: string[] = [];
        const result = locales.buildLocales(root, "map.w3x", translations, (text: string) =>
            warnings.push(text),
        );
        assert(warnings.some((text) => text.includes("map:name")));
        assert.equal(wts(root, "enUS").getString(result.mapReferences.name), "無盡高塔");
        assert.equal(
            wts(root, "enUS").getString(result.mapReferences.description),
            "在無盡高塔中挑戰敵人，取得裝備與技能。",
        );
        assert(!warnings.some((text) => text.includes("prologueScreen")));
    }));
test("地圖翻譯首次由 W3I 的原始字串表建立", () =>
    fixture((root, translations) => {
        const maps = path.join(root, "i18n/map");
        for (const code of ["zh-TW", "zh-CN", "en-US"])
            fs.writeFileSync(path.join(maps, code + ".json"), "{}");
        locales.buildLocales(root, "map.w3x", translations, () => {});
        assert.equal(
            JSON.parse(fs.readFileSync(path.join(maps, "zh-TW.json"), "utf8")).name,
            "TypeScript Template",
        );
    }));
test("自動層保留原始地圖雜湊，其他語言沒有新增空白 WTS", () =>
    fixture((root, translations) => {
        const directory = path.join(root, "maps/map.w3x");
        const hashes = () =>
            fs.readdirSync(directory).map((name) =>
                createHash("sha256")
                    .update(fs.readFileSync(path.join(directory, name)))
                    .digest("hex"),
            );
        const before = hashes();
        fs.mkdirSync(path.join(root, "dist/map.w3x/_Locales/deDE.w3mod"), { recursive: true });
        locales.buildLocales(root, "map.w3x", translations);
        assert.deepEqual(hashes(), before);
        assert.deepEqual(fs.readdirSync(path.join(root, "dist/map.w3x/_Locales/deDE.w3mod")), []);
    }));
test("相同輸入的翻譯鍵得到相同編號", () => {
    let first: unknown;
    fixture((root, data) => {
        first = locales.buildLocales(root, "map.w3x", data).references;
    });
    fixture((root, data) =>
        assert.deepEqual(locales.buildLocales(root, "map.w3x", data).references, first),
    );
});
test("自動層拒絕 dist 外的輸出與不支援的 W3I 版本", () => {
    assert.throws(
        () => locales.buildLocales(process.cwd(), "../maps/map.w3x", {}),
        /只能寫入 dist/,
    );
    const buffer = Buffer.alloc(32);
    buffer.writeInt32LE(40);
    assert.throws(() => locales.mapTextSlots(buffer), /不支援/);
});
