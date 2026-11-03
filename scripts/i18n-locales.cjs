const fs = require("node:fs");
const path = require("node:path");
const Wts = require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/wts/file").default;
const {
    fields,
    objects,
    codeOf,
    readTemplate,
    readMap,
    mergeTemplate,
} = require("./i18n-objects.cjs");

const locales = { "zh-TW": "zhTW", "zh-CN": "zhCN", "en-US": "enUS" };

/** 只定位已知文字；不讓舊解析器重新儲存第 39 版的未知區段。 */
function mapTextSlots(buffer) {
    const version = buffer.readInt32LE(0);
    if (![25, 28, 31, 32, 33, 39].includes(version))
        throw new Error(`不支援的地圖資訊版本：${version}`);
    let cursor = version > 27 ? 28 : 12;
    const slots = [];
    const read = (key) => {
        const start = cursor;
        const end = buffer.indexOf(0, start);
        if (end < 0) throw new Error(`地圖資訊文字未結束：${key}`);
        cursor = end + 1;
        if (key)
            slots.push({ key, start, end: cursor, value: buffer.toString("utf8", start, end) });
    };
    for (const key of ["name", "author", "description", "recommendedPlayers"]) read(key);
    // 鏡頭邊界、邊界補數、可玩寬高、旗標、地形組、載入畫面編號。
    cursor += 32 + 16 + 8 + 4 + 1 + 4;
    // 第 39 版在載入畫面編號後多一個 4 位元組整數（實測原始地圖為 64）。
    // 未跳過時，會把字串寫進此整數，使 WC3 無法載入地圖（2026-10-26 遊戲內實測）。
    if (version >= 39) cursor += 4;
    read(); // 載入畫面模型路徑不是翻譯文字。
    for (const key of ["loadingScreenText", "loadingScreenTitle", "loadingScreenSubtitle"])
        read(key);
    cursor += 4;
    read(); // 序幕模型路徑不是翻譯文字。
    for (const key of ["prologueScreenText", "prologueScreenTitle", "prologueScreenSubtitle"])
        read(key);
    verifyFogFields(buffer, cursor);
    return slots;
}

/**
 * 文字欄位之後是霧的設定。數值不合理表示欄位位置錯誤；此時停止建置，不寫出損壞的地圖。
 */
function verifyFogFields(buffer, cursor) {
    if (cursor + 16 > buffer.length) throw new Error("地圖資訊結構不符：霧設定超出檔案範圍。");
    const style = buffer.readInt32LE(cursor);
    const start = buffer.readFloatLE(cursor + 4);
    const end = buffer.readFloatLE(cursor + 8);
    const density = buffer.readFloatLE(cursor + 12);
    const plausible = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
    if (
        !plausible(style, 16) ||
        !plausible(start, 100000) ||
        !plausible(end, 100000) ||
        !plausible(density, 16)
    )
        throw new Error(
            `地圖資訊結構不符：霧設定不合理（style=${style}, start=${start}, end=${end}, density=${density}）。` +
                "文字欄位位置可能錯誤，已停止改寫。",
        );
}

function rewriteMapText(buffer, slots, references) {
    const parts = [];
    let cursor = 0;
    for (const slot of slots) {
        parts.push(buffer.subarray(cursor, slot.start));
        parts.push(Buffer.from((references[slot.key] ?? slot.value) + "\0", "utf8"));
        cursor = slot.end;
    }
    parts.push(buffer.subarray(cursor));
    return Buffer.concat(parts);
}

/** 先由原始文字建立執行時表，再呼叫此函式改寫建置檔。 */
function buildLocales(root, mapFolder, translations, warn = (message) => console.warn(message)) {
    const dist = path.resolve(root, "dist");
    const target = path.resolve(dist, mapFolder);
    if (!target.startsWith(dist + path.sep)) throw new Error("語言檔只能寫入 dist 內的地圖。");
    const original = new Wts();
    const wtsPath = path.join(target, "war3map.wts");
    if (fs.existsSync(wtsPath)) original.load(fs.readFileSync(wtsPath, "utf8"));
    const strings = Object.fromEntries(
        Object.keys(locales).map((locale) => [locale, new Map(original.stringMap)]),
    );
    let next = Math.max(0, ...original.stringMap.keys()) + 1;
    const references = {};
    const add = (key, values) => {
        if (next > 2147483647) throw new Error("字串編號超過整數上限。");
        const id = next++;
        references[key] = "TRIGSTR_" + String(id).padStart(3, "0");
        for (const locale of Object.keys(locales)) {
            const text = values[locale] ?? values["zh-TW"];
            if (text.includes("\0") || /(^|\r?\n)}(\r?\n|$)/.test(text))
                throw new Error(`字串含有 WTS 不支援的分隔內容：${key}`);
            strings[locale].set(id, text);
        }
    };
    for (const entry of [...translations.entries].sort((a, b) => a.key.localeCompare(b.key))) {
        add(
            entry.key,
            Object.fromEntries(
                Object.keys(locales).map((locale) => [
                    locale,
                    translations.tables[locale][entry.key] ??
                        translations.tables["zh-TW"][entry.key],
                ]),
            ),
        );
    }
    const source = readMap(target);
    for (const [kind, extension] of [
        ["unit", "w3u"],
        ["item", "w3t"],
        ["ability", "w3a"],
    ]) {
        for (const fileKey of [extension, extension + "Skin"]) {
            const file = source[fileKey];
            if (!file) continue;
            for (const object of objects(file))
                for (const mod of object.modifications) {
                    const field = fields[kind][mod.id];
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
                    const key = `${kind}:${codeOf(object)}:${field}${level ? ":" + level : ""}`;
                    if (references[key]) mod.value = references[key];
                }
            fs.writeFileSync(
                path.join(target, `war3map${fileKey.endsWith("Skin") ? "Skin" : ""}.${extension}`),
                Buffer.from(file.save()),
            );
        }
    }
    const infoPath = path.join(target, "war3map.w3i");
    const info = fs.readFileSync(infoPath);
    const slots = mapTextSlots(info);
    const directory = path.join(root, "i18n/map");
    fs.mkdirSync(directory, { recursive: true });
    const base = readTemplate(path.join(directory, "zh-TW.json"));
    for (const slot of slots) {
        if (typeof base[slot.key] !== "string") {
            const resolved = /^TRIGSTR_\d+$/.test(slot.value)
                ? original.getString(slot.value)
                : slot.value;
            if (resolved === undefined)
                throw new Error(`找不到地圖字串：${slot.key}，${slot.value}`);
            base[slot.key] = resolved;
        }
    }
    fs.writeFileSync(path.join(directory, "zh-TW.json"), JSON.stringify(base, null, 2) + "\n");
    const tables = { "zh-TW": base };
    for (const locale of ["zh-CN", "en-US"]) {
        const filename = path.join(directory, locale + ".json");
        const merged = mergeTemplate(base, readTemplate(filename));
        fs.writeFileSync(filename, JSON.stringify(merged.template, null, 2) + "\n");
        for (const key of merged.missing)
            if (base[key] !== "") warn(`${locale} 尚未翻譯，使用 zh-TW：map:${key}`);
        for (const key of merged.deleted) warn(`${locale} 已刪除地圖文字鍵，保留舊翻譯：${key}`);
        tables[locale] = merged.template;
    }
    const mapReferences = {};
    for (const slot of slots) {
        if (base[slot.key] === "") {
            mapReferences[slot.key] = "";
            continue;
        }
        add(
            "map:" + slot.key,
            Object.fromEntries(
                Object.keys(locales).map((locale) => [
                    locale,
                    tables[locale][slot.key] || base[slot.key],
                ]),
            ),
        );
        mapReferences[slot.key] = references["map:" + slot.key];
    }
    fs.writeFileSync(infoPath, rewriteMapText(info, slots, mapReferences));
    // config 的地圖名稱與說明也使用同一編號，不保留原本的英文參照。
    const luaPath = path.join(target, "war3map.lua");
    if (fs.existsSync(luaPath)) {
        let lua = fs.readFileSync(luaPath, "utf8");
        for (const [native, key] of [
            ["SetMapName", "name"],
            ["SetMapDescription", "description"],
        ]) {
            lua = lua.replace(
                new RegExp(`(${native}\\(\\s*)"(?:[^"\\\\]|\\\\.)*"(\\s*\\))`, "g"),
                (_, before, after) => before + JSON.stringify(mapReferences[key]) + after,
            );
        }
        fs.writeFileSync(luaPath, lua);
    }
    for (const [locale, code] of Object.entries(locales)) {
        const wts = new Wts();
        wts.stringMap = strings[locale];
        const directory = path.join(target, "_Locales", code + ".w3mod");
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, "war3map.wts"), wts.save());
        if (locale === "zh-TW") fs.writeFileSync(wtsPath, wts.save());
    }
    return { references, mapReferences };
}

module.exports = { mapTextSlots, rewriteMapText, buildLocales };
