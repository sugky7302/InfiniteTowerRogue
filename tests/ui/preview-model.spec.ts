import { strict as assert } from "node:assert";
import type Model from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model";
import type GenericObject from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/genericobject";

const { parsers } = require("mdx-m3-viewer-th");
const retainedFields = ["bones", "lights", "helpers", "attachments", "collisionShapes"] as const;
const effectFields = [
    "particleEmitters",
    "particleEmitters2",
    "particleEmittersPopcorn",
    "ribbonEmitters",
    "eventObjects",
] as const;
const resourceFields = [
    "geosets",
    "materials",
    "textures",
    "sequences",
    "globalSequences",
] as const;
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

function fixture(withEffects: boolean): Model {
    const nodes = withEffects
        ? `
            ParticleEmitter "舊式粒子" { ObjectId 0, Parent 1, }
            Bone "主骨骼" { ObjectId 1, GeosetId 0, GeosetAnimId None, }
            ParticleEmitter2 "粒子甲" { ObjectId 2, Parent 1, TextureID 0, }
            Helper "輔助甲" { ObjectId 3, Parent 2, }
            EventObject "事件" { ObjectId 4, Parent 1, EventTrack 1 { 100, } }
            Bone "次骨骼" { ObjectId 5, Parent 1, GeosetId 0, GeosetAnimId None, }
            RibbonEmitter "緞帶" { ObjectId 6, Parent 5, MaterialID 0, }
            Attachment "附件甲" { ObjectId 7, Parent 3, AttachmentID 0, }
            Light "光源甲" { ObjectId 8, Parent 5, Omnidirectional, }
            Helper "輔助乙" { ObjectId 9, Parent 8, }
            ParticleEmitter2 "粒子乙" { ObjectId 10, Parent 5, TextureID 0, }
            CollisionShape "碰撞甲" { ObjectId 11, Parent 7, Sphere, BoundsRadius 1, }
            Attachment "附件乙" { ObjectId 12, Parent 6, AttachmentID 1, }
            Light "光源乙" { ObjectId 13, Parent 14, Omnidirectional, }
            ParticleEmitterPopcorn "爆米花粒子" { ObjectId 14, Parent 1, }
            CollisionShape "碰撞乙" { ObjectId 15, Parent 9, Sphere, BoundsRadius 2, }
        `
        : `
            Bone "主骨骼" { ObjectId 0, GeosetId 0, GeosetAnimId None, }
            Bone "次骨骼" { ObjectId 1, Parent 0, GeosetId 0, GeosetAnimId None, }
            Light "光源甲" { ObjectId 2, Parent 1, Omnidirectional, }
            Light "光源乙" { ObjectId 3, Omnidirectional, }
            Helper "輔助甲" { ObjectId 4, }
            Helper "輔助乙" { ObjectId 5, Parent 2, }
            Attachment "附件甲" { ObjectId 6, Parent 4, AttachmentID 0, }
            Attachment "附件乙" { ObjectId 7, AttachmentID 1, }
            CollisionShape "碰撞甲" { ObjectId 8, Parent 6, Sphere, BoundsRadius 1, }
            CollisionShape "碰撞乙" { ObjectId 9, Parent 5, Sphere, BoundsRadius 2, }
        `;
    const pivotCount = withEffects ? 16 : 10;
    const pivots = Array.from(
        { length: pivotCount },
        (_, id) => `{ ${id + 0.25}, ${-id - 0.5}, ${id * 2 + 0.75} },`,
    ).join("\n");
    const model: Model = new parsers.mdlx.Model();
    // 版本 900 支援爆米花粒子。此版本的解析器可從 MDL 讀入全部測試節點。
    model.load(`
        Version { FormatVersion 900, }
        Model "預覽測試" { BlendTime 150, }
        Sequences 1 { Anim "待命" { Interval { 0, 1000 }, } }
        GlobalSequences 1 { Duration 1000, }
        Textures 1 { Bitmap { Image "測試.blp", } }
        Materials 1 { Material { Layer { FilterMode None, static TextureID 0, } } }
        Geoset {
            Vertices 3 { { 0, 0, 0 }, { 1, 0, 0 }, { 0, 1, 0 }, }
            Normals 3 { { 0, 0, 1 }, { 0, 0, 1 }, { 0, 0, 1 }, }
            TVertices 3 { { 0, 0 }, { 1, 0 }, { 0, 1 }, }
            VertexGroup { 0, 1, 0, }
            Faces 1 3 { Triangles { { 0, 1, 2 }, } }
            Groups 2 3 { Matrices { ${withEffects ? "5, 1" : "1, 0"} }, Matrices { ${withEffects ? 5 : 1} }, }
            MaterialID 0,
            SelectionGroup 0,
        }
        ${nodes}
        PivotPoints ${pivotCount} { ${pivots} }
    `);
    return model;
}

function retainedNodes(model: Model): GenericObject[] {
    // viewer/handlers/mdx/model.js 依此類別順序建立 genericObjects，各陣列維持原順序。
    // genericobject.js 以 objectId 取得 pivot，modelinstance.js 以 parentId 取得父節點。
    // 因此輸出的 objectId 必須符合此陣列順序，不能只把舊 objectId 排序。
    return retainedFields.flatMap<GenericObject>((field) => model[field]);
}

function matrixBoneNames(model: Model): string[][][] {
    return model.geosets.map((geoset) => {
        let offset = 0;
        // geoset.js 的 matrixGroups 是各組長度，matrixIndices 才是節點編號。
        return Array.from(geoset.matrixGroups, (size) => {
            const names = Array.from(geoset.matrixIndices.slice(offset, offset + size), (id) => {
                const bone = model.bones.find((node) => node.objectId === id);
                assert.ok(bone, `矩陣編號 ${id} 應指向存在的骨骼。`);
                return bone.name;
            });
            offset += size;
            return names;
        });
    });
}

function snapshot(model: Model) {
    const nodes = retainedNodes(model);
    const allNodes = [...nodes, ...effectFields.flatMap<GenericObject>((field) => model[field])];
    return {
        names: retainedFields.map((field) => model[field].map((node) => node.name)),
        nodes: nodes.map((node) => ({
            name: node.name,
            objectId: node.objectId,
            parentId: node.parentId,
            parentName: allNodes.find((parent) => parent.objectId === node.parentId)?.name,
            pivot: Array.from(model.pivotPoints[node.objectId]),
        })),
        pivots: model.pivotPoints.map((pivot) => Array.from(pivot)),
        matrixGroups: model.geosets.map((geoset) => Array.from(geoset.matrixGroups)),
        matrixIndices: model.geosets.map((geoset) => Array.from(geoset.matrixIndices)),
        matrixNames: matrixBoneNames(model),
        resources: resourceFields.map((field) => model[field].length),
    };
}

function assertFixture(model: Model, withEffects: boolean): void {
    assert.deepEqual(
        retainedFields.map((field) => model[field].map((node) => node.name)),
        [
            ["主骨骼", "次骨骼"],
            ["光源甲", "光源乙"],
            ["輔助甲", "輔助乙"],
            ["附件甲", "附件乙"],
            ["碰撞甲", "碰撞乙"],
        ],
        "假模型應讀入各兩個骨骼、光源、輔助節點、附件點與碰撞形狀，名稱及順序應正確。",
    );
    assert.deepEqual(
        effectFields.map((field) => model[field].length),
        withEffects ? [1, 2, 1, 1, 1] : [0, 0, 0, 0, 0],
        "含效果的假模型應讀入三種粒子共四個、緞帶一個與事件一個。無效果的假模型應全部為零。",
    );
    const allNodes = [
        ...retainedNodes(model),
        ...effectFields.flatMap<GenericObject>((field) => model[field]),
    ].sort((a, b) => a.objectId - b.objectId);
    const expectedCount = withEffects ? 16 : 10;
    assert.equal(allNodes.length, expectedCount, `假模型應有 ${expectedCount} 個節點。`);
    assert.equal(model.pivotPoints.length, expectedCount, `假模型應有 ${expectedCount} 個 pivot。`);
    assert.deepEqual(
        allNodes.map((node) => node.objectId),
        Array.from({ length: expectedCount }, (_, id) => id),
        "假模型的節點編號應從零開始且連續。",
    );
    for (const node of allNodes) {
        const id = node.objectId;
        assert.deepEqual(
            Array.from(model.pivotPoints[id]),
            [id + 0.25, -id - 0.5, id * 2 + 0.75],
            `假模型節點 ${node.name} 的 pivot 應符合原編號 ${id}。`,
        );
    }
    assert.deepEqual(
        matrixBoneNames(model),
        [[["次骨骼", "主骨骼"], ["次骨骼"]]],
        "假模型的兩組矩陣應依序指向次骨骼、主骨骼與次骨骼。",
    );
    assert.deepEqual(
        resourceFields.map((field) => model[field].length),
        [1, 1, 1, 1, 1],
        "假模型應各有一個幾何、材質、貼圖、序列與全域序列。",
    );
}

const model = fixture(true);
const cleanModel = fixture(false);
verify("含效果的 MDL 假模型可以讀入，節點與 pivot 數量正確。", () => assertFixture(model, true));
verify("無效果的 MDL 假模型可以讀入，節點與 pivot 數量正確。", () =>
    assertFixture(cleanModel, false),
);
const before = snapshot(model);

// 先驗證假模型，再載入使用者將實作的模組。實作前應在這裡因缺少模組而失敗。
const { stripEffects } = require("../../scripts/preview-model.cjs");
assert.equal(typeof stripEffects, "function", "預期模組匯出 stripEffects 函式。");
verify("回傳原本的 Model 物件。", () => {
    assert.equal(stripEffects(model), model, "stripEffects 應回傳傳入的同一個 Model 物件。");
});

function verifyStripped(result: Model, stage: string): void {
    verify(`${stage}的三種粒子、緞帶與事件數量全部為零。`, () => {
        for (const field of effectFields) {
            assert.equal(result[field].length, 0, `${stage}的 ${field} 數量應為 0。`);
        }
    });
    verify(`${stage}保留全部一般節點及各類別的名稱順序。`, () => {
        assert.deepEqual(
            retainedFields.map((field) => result[field].map((node) => node.name)),
            before.names,
            `${stage}的骨骼、光源、輔助節點、附件點與碰撞形狀應保留原名稱及各自順序。`,
        );
    });
    const nodes = retainedNodes(result);
    verify(`${stage}的節點依保留順序連續編號。`, () => {
        assert.deepEqual(
            nodes.map((node) => node.objectId),
            before.nodes.map((_, id) => id),
            `${stage}的 objectId 應依保留順序為 0 至 ${before.nodes.length - 1}。`,
        );
    });
    verify(`${stage}的父節點名稱正確，已移除的父節點改為 -1。`, () => {
        for (const original of before.nodes) {
            const node = nodes.find((candidate) => candidate.name === original.name)!;
            const parent = nodes.find((candidate) => candidate.name === original.parentName);
            const expectedId = parent ? parent.objectId : -1;
            assert.equal(
                node.parentId,
                expectedId,
                `${stage}節點 ${node.name} 的 parentId 應為 ${expectedId}。保留的父節點應為 ${parent?.name ?? "無"}。`,
            );
        }
    });
    verify(`${stage}的 pivot 數量與節點數量相同，各節點的原值保留。`, () => {
        assert.equal(
            result.pivotPoints.length,
            nodes.length,
            `${stage}的 pivotPoints 長度應等於保留節點數 ${nodes.length}。`,
        );
        for (const original of before.nodes) {
            const node = nodes.find((candidate) => candidate.name === original.name)!;
            assert.ok(result.pivotPoints[node.objectId], `${stage}節點 ${node.name} 應有 pivot。`);
            assert.deepEqual(
                Array.from(result.pivotPoints[node.objectId]),
                original.pivot,
                `${stage}節點 ${node.name} 的 pivot 應等於移除前的 ${original.pivot.join("、")}。`,
            );
        }
    });
    verify(`${stage}的矩陣群組仍指向原名稱的骨骼。`, () => {
        assert.deepEqual(
            result.geosets.map((geoset) => Array.from(geoset.matrixGroups)),
            before.matrixGroups,
            `${stage}的 matrixGroups 各組長度應維持原值。`,
        );
        assert.deepEqual(
            result.geosets.map((geoset) => geoset.matrixIndices.length),
            before.matrixIndices.map((indices) => indices.length),
            `${stage}的 matrixIndices 長度應維持原值。`,
        );
        assert.deepEqual(
            matrixBoneNames(result),
            before.matrixNames,
            `${stage}的每個矩陣編號應指向移除前相同名稱的骨骼。`,
        );
    });
    verify(`${stage}的幾何、材質、貼圖、序列與全域序列數量不變。`, () => {
        assert.deepEqual(
            resourceFields.map((field) => result[field].length),
            before.resources,
            `${stage}的幾何、材質、貼圖、序列與全域序列數量應各為 1。`,
        );
    });
}

verifyStripped(model, "移除後");
const reloaded: Model = new parsers.mdlx.Model();
verify("結果可以儲存為 MDX，再讀回 Model。", () => {
    assert.doesNotThrow(() => reloaded.load(model.saveMdx()), "結果應可儲存為 MDX 並成功讀回。");
});
verifyStripped(reloaded, "MDX 讀回後");
verify("無效果模型的內容保持不變。", () => {
    const original = snapshot(cleanModel);
    const bytes = cleanModel.saveMdx();
    assert.equal(stripEffects(cleanModel), cleanModel, "無效果時應回傳同一個 Model 物件。");
    assert.deepEqual(
        snapshot(cleanModel),
        original,
        "無效果時，節點、編號、父節點、pivot、矩陣群組與資源數量應保持不變。",
    );
    assert.deepEqual(cleanModel.saveMdx(), bytes, "無效果時，全部 MDX 位元組應保持不變。");
});

function errorSnapshot(model: Model) {
    return {
        nodes: [...retainedFields, ...effectFields].map((field) =>
            model[field].map((node) => ({
                name: node.name,
                objectId: node.objectId,
                parentId: node.parentId,
            })),
        ),
        effects: effectFields.map((field) => model[field].length),
        pivots: model.pivotPoints.map((pivot) => Array.from(pivot)),
        matrixIndices: model.geosets.map((geoset) => Array.from(geoset.matrixIndices)),
        matrixGroups: model.geosets.map((geoset) => Array.from(geoset.matrixGroups)),
        bytes: new Uint8Array(model.saveMdx()),
    };
}

for (const scenario of [
    { name: "不存在的節點", oldId: 999999 },
    { name: "要移除的粒子發射器", oldId: fixture(true).particleEmitters[0].objectId },
]) {
    const geosetIndex = 1;
    const itemIndex = 2;
    function invalidModel(): Model {
        const result = fixture(true);
        // 第二個幾何使用獨立資料，讓測試可以發現第一個幾何已被部分改寫。
        result.geosets.push(fixture(true).geosets[0]);
        result.geosets[geosetIndex].matrixIndices[itemIndex] = scenario.oldId;
        return result;
    }

    verify(`矩陣編號指向${scenario.name}時丟出錯誤。`, () => {
        assert.throws(
            () => stripEffects(invalidModel()),
            Error,
            `矩陣編號 ${scenario.oldId} 沒有對應的保留節點時，應丟出錯誤。`,
        );
    });

    verify(`矩陣編號指向${scenario.name}時，錯誤發生後模型完全不變。`, () => {
        const result = invalidModel();
        const original = errorSnapshot(result);
        assert.throws(() => stripEffects(result), Error, "應丟出矩陣編號錯誤。");
        assert.deepEqual(
            errorSnapshot(result),
            original,
            "丟出錯誤時，全部節點、效果數量、pivot、各幾何矩陣與 MDX 位元組應保持不變。",
        );
    });

    verify(`矩陣編號指向${scenario.name}時，錯誤訊息包含位置與舊編號。`, () => {
        assert.throws(
            () => stripEffects(invalidModel()),
            (error: unknown) => {
                assert.ok(error instanceof Error, "應丟出 Error 物件。");
                // 幾何與項目索引從 0 開始。只檢查三個完整數字，不限制其他訊息文字。
                const numbers: string[] = error.message.match(/\d+/g) ?? [];
                for (const value of [geosetIndex, itemIndex, scenario.oldId]) {
                    assert.ok(
                        numbers.includes(String(value)),
                        `錯誤訊息應包含幾何索引 ${geosetIndex}、項目索引 ${itemIndex} 與舊編號 ${scenario.oldId}。收到「${error.message}」。`,
                    );
                }
                return true;
            },
            "應丟出包含位置與舊編號的錯誤。",
        );
    });
}

console.log(`英雄預覽 T1 測試共 ${count} 組通過，${failures} 組失敗。`);
if (failures > 0) {
    process.exitCode = 1;
}
