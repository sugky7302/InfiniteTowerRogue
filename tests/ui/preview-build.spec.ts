import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type Model from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model";

const { parsers } = require("mdx-m3-viewer-th");
const { stripEffects, makeUnshaded, buildPreviewHero } =
    require("../../scripts/preview-model.cjs") as {
        stripEffects: (model: Model) => Model;
        makeUnshaded: (model: Model) => Model;
        buildPreviewHero?: (bytes: Uint8Array, options: { unshaded: boolean }) => Uint8Array;
    };
const { previewMdl, writePreviewModels } = require("../../scripts/ui-models.cjs") as {
    previewMdl: (heroModel: string, index: number) => string;
    writePreviewModels: (
        uiFolder: string,
        heroModel: string,
        options?: { source?: string; unshaded?: boolean; warn?: (...args: unknown[]) => void },
    ) => string;
};
const effectFields = [
    "particleEmitters",
    "particleEmitters2",
    "particleEmittersPopcorn",
    "ribbonEmitters",
    "eventObjects",
] as const;
const retainedFields = ["bones", "lights", "helpers", "attachments", "collisionShapes"] as const;
const heroModel = "測試\\自訂英雄.mdx";
const copyName = "itr-hero-archmage-unshaded.mdx";
const copyPath = `ui\\${copyName}`;
const wrapperName = "itr-hero-preview.mdx";
let count = 0;
let failures = 0;

function verify(name: string, action: () => void): void {
    try {
        action();
        count++;
        console.log(`通過。${name}`);
    } catch (error) {
        failures++;
        console.error(`失敗。${name}`);
        console.error(error);
    }
}

function fixtureBytes(): Uint8Array {
    const model: Model = new parsers.mdlx.Model();
    // 效果節點與保留節點交錯，輔助節點的父節點會被移除。
    model.load(`
        Version { FormatVersion 900, }
        Model "建置測試" { BlendTime 150, }
        Sequences 1 { Anim "待命" { Interval { 0, 1000 }, } }
        GlobalSequences 1 { Duration 1000, }
        Textures 2 {
            Bitmap { Image "主貼圖.blp", }
            Bitmap { Image "次貼圖.blp", }
        }
        Materials 2 {
            Material {
                Layer { FilterMode None, static TextureID 0, static Alpha 0.5, }
            }
            Material {
                Layer { FilterMode Blend, Unshaded, static TextureID 1, }
                Layer { FilterMode Additive, TwoSided, Unfogged, static TextureID 0, }
                Layer { FilterMode Transparent, Unshaded, TwoSided, static TextureID 1, }
            }
        }
        Geoset {
            Vertices 3 { { 0, 0, 0 }, { 1, 0, 0 }, { 0, 1, 0 }, }
            Normals 3 { { 0, 0, 1 }, { 0, 0, 1 }, { 0, 0, 1 }, }
            TVertices 3 { { 0, 0 }, { 1, 0 }, { 0, 1 }, }
            VertexGroup { 0, 0, 0, }
            Faces 1 3 { Triangles { { 0, 1, 2 }, } }
            Groups 1 1 { Matrices { 1 }, }
            MaterialID 1,
            SelectionGroup 0,
        }
        ParticleEmitter "舊式粒子" { ObjectId 0, Parent 1, }
        Bone "骨骼" { ObjectId 1, GeosetId 0, GeosetAnimId None, }
        ParticleEmitter2 "粒子" { ObjectId 2, Parent 1, TextureID 0, }
        Helper "輔助" { ObjectId 3, Parent 2, }
        EventObject "事件" { ObjectId 4, Parent 1, EventTrack 1 { 100, } }
        Attachment "附件" { ObjectId 5, Parent 3, AttachmentID 0, }
        RibbonEmitter "緞帶" { ObjectId 6, Parent 1, MaterialID 0, }
        Light "光源" { ObjectId 7, Parent 1, Omnidirectional, }
        ParticleEmitterPopcorn "爆米花粒子" { ObjectId 8, Parent 1, }
        CollisionShape "碰撞" { ObjectId 9, Parent 5, Sphere, BoundsRadius 2, }
        PivotPoints 10 {
            { 0.25, 0.5, 0.75 }, { 1, 2, 3 }, { 2, 3, 4 }, { 3, 4, 5 }, { 4, 5, 6 },
            { 5, 6, 7 }, { 6, 7, 8 }, { 7, 8, 9 }, { 8, 9, 10 }, { 9, 10, 11 },
        }
    `);
    return new Uint8Array(model.saveMdx());
}

function readModel(bytes: Uint8Array | string): Model {
    const model: Model = new parsers.mdlx.Model();
    model.load(bytes);
    return model;
}

function build(bytes: Uint8Array, unshaded: boolean): Uint8Array {
    assert.equal(typeof buildPreviewHero, "function", "預期模組匯出 buildPreviewHero 函式。");
    const result = buildPreviewHero!(bytes, { unshaded });
    assert.ok(result instanceof Uint8Array, "建置結果應為 Uint8Array。");
    return result;
}

function layerFlags(model: Model): number[][] {
    return model.materials.map((material) => material.layers.map((layer) => layer.flags));
}

function assertNoEffects(model: Model): void {
    for (const field of effectFields) {
        assert.equal(model[field].length, 0, `${field} 應為空陣列。`);
    }
}

function verifyWrite(name: string, action: (root: string, uiFolder: string) => void): void {
    verify(name, () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "itr-preview-build-"));
        const cwd = process.cwd();
        const unshaded = process.env.ITR_PREVIEW_UNSHADED;
        try {
            const uiFolder = path.join(root, "ui");
            fs.mkdirSync(uiFolder);
            action(root, uiFolder);
        } finally {
            process.chdir(cwd);
            if (unshaded === undefined) {
                delete process.env.ITR_PREVIEW_UNSHADED;
            } else {
                process.env.ITR_PREVIEW_UNSHADED = unshaded;
            }
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
}

function writeSource(root: string): { source: string; bytes: Uint8Array } {
    const source = path.join(root, "來源英雄.mdx");
    const bytes = fixtureBytes();
    fs.writeFileSync(source, bytes);
    return { source, bytes };
}

function readOutput(uiFolder: string, name: string): Model {
    return readModel(fs.readFileSync(path.join(uiFolder, name)));
}

verify("T3 的假模型可儲存並讀回，包含全部效果、不同圖層旗標與交錯節點。", () => {
    const bytes = fixtureBytes();
    const model = readModel(bytes);
    assert.deepEqual(new Uint8Array(model.saveMdx()), bytes, "MDX 讀回後的位元組應相同。");
    assert.deepEqual(
        effectFields.map((field) => model[field].length),
        [1, 1, 1, 1, 1],
    );
    assert.deepEqual(layerFlags(model), [[0x0], [0x1, 0x30, 0x11]]);
    assert.deepEqual(
        retainedFields.map((field) => model[field].length),
        [1, 1, 1, 1, 1],
    );
    assert.equal(model.helpers[0].parentId, model.particleEmitters2[0].objectId);
    assert.equal(model.pivotPoints.length, 10);
    assert.deepEqual(Array.from(model.geosets[0].matrixIndices), [1]);
});

verify("模組匯出 buildPreviewHero，建置結果為 Uint8Array。", () => {
    build(fixtureBytes(), true);
});

for (const unshaded of [true, false]) {
    verify(`unshaded 為 ${unshaded} 時，輸入位元組完全不變。`, () => {
        const bytes = fixtureBytes();
        const before = new Uint8Array(bytes);
        build(bytes, unshaded);
        assert.deepEqual(bytes, before, "建置不得修改輸入位元組。");
    });
}

verify("結果可讀回 Model，效果為零，保留節點與 pivot 等於單獨呼叫 stripEffects 的結果。", () => {
    const bytes = fixtureBytes();
    const expected = stripEffects(readModel(bytes));
    const actual = readModel(build(bytes, false));
    assertNoEffects(actual);
    for (const field of retainedFields) {
        assert.deepEqual(actual[field], expected[field], `${field} 應與單獨移除效果的結果相同。`);
    }
    assert.deepEqual(
        actual.pivotPoints,
        expected.pivotPoints,
        "pivot 應與單獨移除效果的結果相同。",
    );
});

verify("unshaded 為 true 時，每個圖層都有 0x1，全部位元組等於依序處理的結果。", () => {
    const bytes = fixtureBytes();
    const expected = readModel(bytes);
    stripEffects(expected);
    makeUnshaded(expected);
    const actual = build(bytes, true);
    assert.deepEqual(
        layerFlags(readModel(actual)).map((flags) => flags.map((flag) => flag & 0x1)),
        [[0x1], [0x1, 0x1, 0x1]],
        "每個圖層都應設定 0x1。",
    );
    assert.deepEqual(
        actual,
        new Uint8Array(expected.saveMdx()),
        "全部位元組應等於依序處理的結果。",
    );
});

verify("unshaded 為 false 時，原圖層旗標不變，全部位元組等於只移除效果的結果。", () => {
    const bytes = fixtureBytes();
    const expected = readModel(bytes);
    const flags = layerFlags(expected);
    stripEffects(expected);
    const actual = build(bytes, false);
    assert.deepEqual(layerFlags(readModel(actual)), flags, "原圖層旗標應保持不變。");
    assert.deepEqual(
        actual,
        new Uint8Array(expected.saveMdx()),
        "全部位元組應等於只移除效果的結果。",
    );
});

for (const [name, bytes] of [
    ["空位元組", new Uint8Array()],
    ["無效位元組", new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90])],
] as const) {
    verify(`buildPreviewHero 收到${name}時丟出錯誤。`, () => {
        assert.equal(typeof buildPreviewHero, "function", "預期模組匯出 buildPreviewHero 函式。");
        // 直接呼叫被測函式，避免測試輔助函式的斷言造成誤通過。
        assert.throws(() => buildPreviewHero!(bytes, { unshaded: true }), "無效來源應丟出錯誤。");
    });
}

verifyWrite(
    "有來源且 unshaded 為 true 時，輸出複本與包裝模型，回傳附件路徑且沒有警告。",
    (root, uiFolder) => {
        const { source, bytes } = writeSource(root);
        const warnings: unknown[][] = [];
        const result = writePreviewModels(uiFolder, heroModel, {
            source,
            unshaded: true,
            warn: (...args) => warnings.push(args),
        });
        assert.equal(fs.existsSync(path.join(uiFolder, copyName)), true, "應輸出指定名稱的複本。");
        assert.deepEqual(
            new Uint8Array(fs.readFileSync(path.join(uiFolder, copyName))),
            build(bytes, true),
            "複本內容應等於 buildPreviewHero 的結果。",
        );
        assert.equal(readOutput(uiFolder, wrapperName).attachments[0].path, copyPath);
        assert.equal(result, copyPath, "應回傳包裝模型使用的附件路徑。");
        assert.deepEqual(warnings, [], "來源存在時不應發出警告。");
        assert.deepEqual(
            new Uint8Array(fs.readFileSync(source)),
            bytes,
            "來源檔案內容應保持不變。",
        );
    },
);

verifyWrite(
    "有來源且 unshaded 為 false 時，複本保留原圖層旗標並移除全部效果。",
    (root, uiFolder) => {
        const { source, bytes } = writeSource(root);
        const warnings: unknown[][] = [];
        const result = writePreviewModels(uiFolder, heroModel, {
            source,
            unshaded: false,
            warn: (...args) => warnings.push(args),
        });
        const actual = readOutput(uiFolder, copyName);
        assert.deepEqual(layerFlags(actual), layerFlags(readModel(bytes)));
        assertNoEffects(actual);
        assert.deepEqual(new Uint8Array(actual.saveMdx()), build(bytes, false));
        assert.equal(readOutput(uiFolder, wrapperName).attachments[0].path, copyPath);
        assert.equal(result, copyPath);
        assert.deepEqual(warnings, []);
    },
);

verifyWrite("來源不存在時不輸出複本，使用傳入的英雄路徑，並警告一次。", (root, uiFolder) => {
    const source = path.join(root, "不存在的來源.mdx");
    const warnings: unknown[][] = [];
    const result = writePreviewModels(uiFolder, heroModel, {
        source,
        unshaded: true,
        warn: (...args) => warnings.push(args),
    });
    assert.equal(fs.existsSync(path.join(uiFolder, copyName)), false, "來源不存在時不應輸出複本。");
    assert.equal(readOutput(uiFolder, wrapperName).attachments[0].path, heroModel);
    assert.equal(result, heroModel, "應回傳傳入的英雄路徑。");
    assert.equal(warnings.length, 1, "應發出一次警告。");
    assert.ok(warnings[0].map(String).join(" ").includes(source), "警告應包含來源路徑。");
});

for (const [name, bytes] of [
    ["空內容", new Uint8Array()],
    ["無效內容", new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x90])],
] as const) {
    verifyWrite(`來源存在但為${name}時，丟出錯誤且不輸出複本或包裝模型。`, (root, uiFolder) => {
        const source = path.join(root, "損壞的來源.mdx");
        fs.writeFileSync(source, bytes);
        const warnings: unknown[][] = [];
        assert.throws(
            () =>
                writePreviewModels(uiFolder, heroModel, {
                    source,
                    warn: (...args) => warnings.push(args),
                }),
            "無法解析的來源應使建置失敗。",
        );
        assert.equal(fs.existsSync(path.join(uiFolder, copyName)), false, "不應輸出無效複本。");
        assert.equal(fs.existsSync(path.join(uiFolder, wrapperName)), false, "不應輸出包裝模型。");
        assert.deepEqual(warnings, [], "解析錯誤不應進入缺少來源的警告流程。");
    });
}

verifyWrite(
    "包裝模型只有附件 Path 改變，保留一個輔助節點、一個附件與原旋轉。",
    (root, uiFolder) => {
        const { source } = writeSource(root);
        writePreviewModels(uiFolder, heroModel, { source, unshaded: true, warn: () => {} });
        const actual = readOutput(uiFolder, wrapperName);
        const expected = readModel(previewMdl(heroModel, 0));
        assert.equal(actual.helpers.length, 1, "包裝模型應只有一個輔助節點。");
        assert.equal(actual.attachments.length, 1, "包裝模型應只有一個附件。");
        assert.equal(actual.attachments[0].path, copyPath, "附件應使用複本路徑。");
        assert.equal(actual.helpers[0].animations.length, 1, "輔助節點應保留旋轉軌道。");
        assert.equal(actual.helpers[0].animations[0].name, "KGRT");
        assert.deepEqual(
            actual.helpers[0].animations,
            expected.helpers[0].animations,
            "旋轉應保持不變。",
        );
        // 只在預期模型變更附件路徑，再比較全部 MDX 位元組。
        expected.attachments[0].path = copyPath;
        assert.deepEqual(actual.saveMdx(), expected.saveMdx(), "包裝模型的其餘內容應完全相同。");
    },
);

for (const value of ["0", undefined, "1", "false", ""]) {
    verifyWrite(
        `未傳 unshaded，環境變數為${value === undefined ? "未設定" : `「${value}」`}時，使用約定的預設值。`,
        (root, uiFolder) => {
            const { source, bytes } = writeSource(root);
            if (value === undefined) {
                delete process.env.ITR_PREVIEW_UNSHADED;
            } else {
                process.env.ITR_PREVIEW_UNSHADED = value;
            }
            writePreviewModels(uiFolder, heroModel, { source, warn: () => {} });
            assert.deepEqual(
                new Uint8Array(fs.readFileSync(path.join(uiFolder, copyName))),
                build(bytes, value !== "0"),
                "只有環境變數等於 0 時，預設值才應為 false。",
            );
        },
    );
}

for (const unshaded of [true, false]) {
    verifyWrite(`明確傳入 unshaded 為 ${unshaded} 時，優先使用選項值。`, (root, uiFolder) => {
        const { source, bytes } = writeSource(root);
        process.env.ITR_PREVIEW_UNSHADED = unshaded ? "0" : "1";
        writePreviewModels(uiFolder, heroModel, { source, unshaded, warn: () => {} });
        assert.deepEqual(
            new Uint8Array(fs.readFileSync(path.join(uiFolder, copyName))),
            build(bytes, unshaded),
            "明確指定的選項應優先於環境變數。",
        );
    });
}

verifyWrite(
    "只傳兩個參數時，從目前工作資料夾的 assets/models/hero-archmage.mdx 讀取來源。",
    (root, uiFolder) => {
        const bytes = fixtureBytes();
        const sourceFolder = path.join(root, "assets", "models");
        fs.mkdirSync(sourceFolder, { recursive: true });
        fs.writeFileSync(path.join(sourceFolder, "hero-archmage.mdx"), bytes);
        process.chdir(root);
        delete process.env.ITR_PREVIEW_UNSHADED;
        const result = writePreviewModels(uiFolder, heroModel);
        assert.equal(
            fs.existsSync(path.join(uiFolder, copyName)),
            true,
            "應使用目前工作資料夾的預設來源。",
        );
        assert.deepEqual(
            new Uint8Array(fs.readFileSync(path.join(uiFolder, copyName))),
            build(bytes, true),
        );
        assert.equal(readOutput(uiFolder, wrapperName).attachments[0].path, copyPath);
        assert.equal(result, copyPath);
    },
);

console.log(`英雄預覽 T3 測試共 ${count} 組通過，${failures} 組失敗。`);
if (failures > 0) {
    process.exitCode = 1;
}
