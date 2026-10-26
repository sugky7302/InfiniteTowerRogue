const fs = require("node:fs");
const path = require("node:path");
const { ObjectData } = require("war3-objectdata-th/dist/cjs");
const {
    AbilityProps,
    AbilitySpecificProps,
} = require("war3-objectdata-th/dist/cjs/generated/abilities");
const W3u = require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/file").default;
const W3a = require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3d/file").default;
const Wts = require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/wts/file").default;
const ModifiedObject = require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/modifiedobject").default;
const Modification = require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/modification").default;

const fields = {
    unit: { unam: "name", upro: "properNames", utip: "tip", utub: "ubertip", ides: "description" },
    item: { unam: "name", utip: "tip", utub: "ubertip", ides: "description" },
    ability: {
        anam: "name",
        atp1: "tip",
        aub1: "ubertip",
        aut1: "untip",
        auu1: "unubertip",
        aret: "researchtip",
        arut: "researchubertip",
    },
};

function objects(file) {
    return file ? [...file.originalTable.objects, ...file.customTable.objects] : [];
}
function codeOf(object) {
    return object.newId === "\0\0\0\0" ? object.oldId : object.newId;
}
function fourCC(code) {
    if (code.length !== 4) throw new Error(`物件代碼必須有四個字元：${code}`);
    const value = [...code].reduce((result, char) => result * 256 + char.charCodeAt(0), 0);
    if (value > 2147483647) throw new Error(`物件代碼超過整數上限：${code}`);
    return value;
}

function readMap(mapDir) {
    const files = {};
    for (const extension of ["w3u", "w3t", "w3a"]) {
        for (const skin of [false, true]) {
            const name = path.join(mapDir, `war3map${skin ? "Skin" : ""}.${extension}`);
            if (!fs.existsSync(name)) continue;
            const file = extension === "w3a" ? new W3a() : new W3u();
            file.load(fs.readFileSync(name));
            files[extension + (skin ? "Skin" : "")] = file;
        }
    }
    return files;
}

/** 保留套件扁平化前的等級、資料指標與未變更欄位。只包裝此建置的物件資料實例。 */
function preserveLevels(data, source, exampleLevels) {
    const baseline = new ObjectData();
    baseline.load(source);
    const save = data.save.bind(data);
    data.save = () => {
        const saved = save();
        const requests = [];
        for (const fileKey of ["w3a", "w3aSkin"]) {
            for (const original of objects(source[fileKey])) {
                const code = codeOf(original);
                const current = data.abilities.map[code];
                const before = baseline.abilities.map[code];
                if (!current || !before) continue;
                const restore = original.modifications.filter((mod) => {
                    const prop = [
                        ...AbilityProps,
                        ...(AbilitySpecificProps[original.oldId] || []),
                    ].find((prop) => prop.id === mod.id);
                    return prop && current[prop.name] === before[prop.name];
                });
                if (!restore.length) continue;
                requests.push({ fileKey, original, code, restore });
            }
        }
        // 套件依 netsafe 重新分配欄位。先從兩個輸出移除扁平化資料，再還原原始檔的資料。
        for (const { code, restore } of requests) {
            const ids = new Set(restore.map((mod) => mod.id));
            for (const fileKey of ["w3a", "w3aSkin"]) {
                const target = objects(saved[fileKey]).find((object) => codeOf(object) === code);
                if (target)
                    target.modifications = target.modifications.filter((mod) => !ids.has(mod.id));
            }
        }
        for (const { fileKey, original, code, restore } of requests) {
            if (!saved[fileKey]) saved[fileKey] = new W3a();
            const file = saved[fileKey];
            let target = objects(file).find((object) => codeOf(object) === code);
            if (!target) {
                target = new ModifiedObject();
                target.oldId = original.oldId;
                target.newId = original.newId;
                (target.newId === "\0\0\0\0" ? file.originalTable : file.customTable).objects.push(
                    target,
                );
            }
            target.modifications.push(...restore);
        }
        // 範例明確提供兩級文字。原生介面的等級換算由執行時處理。
        if (exampleLevels) {
            const target = objects(saved.w3a).find((object) => codeOf(object) === "A0I1");
            if (!target) throw new Error("找不到範例技能。");
            const ids = new Set(Object.keys(exampleLevels));
            for (const fileKey of ["w3a", "w3aSkin"]) {
                const object = objects(saved[fileKey]).find((object) => codeOf(object) === "A0I1");
                if (object)
                    object.modifications = object.modifications.filter((mod) => !ids.has(mod.id));
            }
            for (const [id, values] of Object.entries(exampleLevels)) {
                values.forEach((value, index) => {
                    const mod = new Modification();
                    mod.id = id;
                    mod.variableType = 3;
                    mod.value = value;
                    mod.levelOrVariation = index + 1;
                    target.modifications.push(mod);
                });
            }
        }
        return saved;
    };
}

/** 僅讀取修改表中的文字。不取得未修改的內建物件，也不覆蓋其用戶端語言。 */
function extractObjects(data, strings = new Wts()) {
    const entries = [];
    const base = {};
    const files = data.save();
    for (const [kind, extension] of [
        ["unit", "w3u"],
        ["item", "w3t"],
        ["ability", "w3a"],
    ]) {
        for (const fileKey of [extension, extension + "Skin"]) {
            for (const object of objects(files[fileKey])) {
                const code = codeOf(object);
                for (const mod of object.modifications) {
                    const field = fields[kind][mod.id];
                    if (!field || typeof mod.value !== "string") continue;
                    const level =
                        kind === "ability" && field !== "name"
                            ? Math.max(1, mod.levelOrVariation)
                            : 0;
                    const key = `${kind}:${code}:${field}${level ? ":" + level : ""}`;
                    let value = mod.value;
                    if (/^TRIGSTR_\d+$/.test(value)) {
                        const resolved = strings.getString(value);
                        if (resolved === undefined)
                            throw new Error(`找不到物件字串：${key}，${value}`);
                        value = resolved;
                    }
                    // 內建字串識別碼由用戶端處理，不能當成基準中文。
                    if (value.startsWith("WESTRING_")) continue;
                    if (!(key in base)) entries.push({ key, kind, id: fourCC(code), field, level });
                    base[key] = value;
                }
            }
        }
    }
    entries.sort((a, b) => a.key.localeCompare(b.key));
    return { entries, base };
}

function mergeTemplate(base, previous = {}) {
    const template = { ...previous };
    const missing = [];
    const deleted = Object.keys(previous)
        .filter((key) => !(key in base))
        .sort();
    for (const key of Object.keys(base).sort()) {
        if (!(key in previous)) template[key] = null;
        if (template[key] === null || template[key] === "") missing.push(key);
    }
    return { template, missing, deleted };
}

function readTemplate(filename) {
    if (!fs.existsSync(filename)) return {};
    const table = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (
        !table ||
        typeof table !== "object" ||
        Array.isArray(table) ||
        Object.values(table).some((value) => value !== null && typeof value !== "string")
    ) {
        throw new Error(`翻譯檔格式錯誤：${filename}。值必須是字串或 null。`);
    }
    return table;
}

function buildTranslations(data, root, warn = (message) => console.warn(message)) {
    const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    const mapDir = path.join(root, "maps", config.mapFolder);
    const strings = new Wts();
    const wts = path.join(mapDir, "war3map.wts");
    if (fs.existsSync(wts)) strings.load(fs.readFileSync(wts, "utf8"));
    const { entries, base } = extractObjects(data, strings);
    const directory = path.join(root, "i18n", "objects");
    fs.mkdirSync(directory, { recursive: true });
    const baselinePath = path.join(directory, "zh-TW.json");
    for (const key of Object.keys(readTemplate(baselinePath))) {
        if (!(key in base)) warn(`基準語言已刪除物件文字鍵：${key}`);
    }
    fs.writeFileSync(baselinePath, JSON.stringify(base, null, 2) + "\n");
    const tables = { "zh-TW": base, "zh-CN": {}, "en-US": {} };
    for (const locale of ["zh-CN", "en-US"]) {
        const filename = path.join(directory, locale + ".json");
        const merged = mergeTemplate(base, readTemplate(filename));
        fs.writeFileSync(filename, JSON.stringify(merged.template, null, 2) + "\n");
        for (const key of merged.deleted) warn(`${locale} 已刪除物件文字鍵，保留舊翻譯：${key}`);
        for (const key of merged.missing) warn(`${locale} 尚未翻譯，使用 zh-TW：${key}`);
        for (const key of Object.keys(base)) {
            const value = merged.template[key];
            if (typeof value === "string" && value !== "") tables[locale][key] = value;
        }
    }
    return { entries, tables };
}

/** 由範例模組的 compiletime 載入。只修改建置資料，不寫入 maps 原始檔。 */
function createExample(data, root) {
    const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    const source = readMap(path.join(root, "maps", config.mapFolder));
    for (const [container, code] of [
        [data.abilities, "A0I1"],
        [data.items, "I0I1"],
        [data.units, "H0I1"],
    ]) {
        if (container.has(code)) throw new Error(`範例物件代碼已被使用：${code}`);
    }
    const ability = data.abilities.copy("AHhb", "A0I1");
    ability.name = "語言之光";
    ability.levels = 2;
    ability.tooltipNormal = "語言之光：第 1 級";
    ability.tooltipNormalExtended = "恢復生命。這是第 1 級的翻譯說明。";
    ability.tooltipLearn = "學習語言之光";
    ability.tooltipLearnExtended = "學習恢復生命的技能。";
    const item = data.items.copy("ratf", "I0I1");
    // 讓一般物件檔也有此自訂物品，不只產生 Skin 文字修改。
    item.goldCost = 1;
    item.name = "語言護符";
    item.tooltipBasic = "攜帶語言護符";
    item.tooltipExtended = "這件物品用來檢查語言切換。";
    item.description = "多語言範例物品。";
    const hero = data.units.copy("Hpal", "H0I1");
    hero.name = "語言守衛";
    hero.properNames = "明光";
    hero.properNamesUsed = 1;
    hero.tooltipBasic = "語言守衛";
    hero.tooltipExtended = "守衛使用可切換語言的技能。";
    hero.description = "多語言範例英雄。";
    hero.hero = "";
    // 固定配置兩級說明，不讓套件把各級資料扁平化。
    preserveLevels(data, source, {
        atp1: ["語言之光：第 1 級", "語言之光：第 2 級"],
        aub1: ["恢復生命。這是第 1 級的翻譯說明。", "恢復更多生命。這是第 2 級的翻譯說明。"],
    });
}

function buildExample(data, root) {
    createExample(data, root);
    return buildTranslations(data, root);
}

/** 產生 Lua 字面表。控制字元使用三位十進位跳脫，避免 JSON 的 Unicode 跳脫不相容。 */
function toLua(value) {
    if (typeof value === "string") {
        return (
            '"' +
            value.replace(/[\\"\x00-\x1f\x7f]/g, (character) => {
                if (character === "\\" || character === '"') return "\\" + character;
                return "\\" + character.charCodeAt(0).toString().padStart(3, "0");
            }) +
            '"'
        );
    }
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647)
        return String(value);
    if (Array.isArray(value)) return "{" + value.map(toLua).join(",") + "}";
    if (value && typeof value === "object") {
        return (
            "{" +
            Object.entries(value)
                .map(([key, entry]) => "[" + toLua(key) + "]=" + toLua(entry))
                .join(",") +
            "}"
        );
    }
    throw new Error("Lua 翻譯資料含有不支援的值。");
}

/** 所有 compiletime 回呼與物件儲存完成後，讀取最終資料並內嵌至 Lua。 */
function finalizeTranslations(root, mapFolder, scriptPath) {
    const source = readMap(path.join(root, "dist", mapFolder));
    const data = new ObjectData();
    data.load(source);
    preserveLevels(data, source);
    const translations = buildTranslations(data, root);
    const script = fs.readFileSync(scriptPath, "utf8");
    fs.writeFileSync(scriptPath, "__i18nObjectData = " + toLua(translations) + "\n" + script);
    return translations;
}

module.exports = {
    fields,
    objects,
    codeOf,
    readTemplate,
    readMap,
    preserveLevels,
    extractObjects,
    mergeTemplate,
    buildTranslations,
    createExample,
    buildExample,
    toLua,
    finalizeTranslations,
};
