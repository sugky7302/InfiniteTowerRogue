import { strict as assert } from "node:assert";
import type Model from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model";
import type GenericObject from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/genericobject";

const { parsers } = require("mdx-m3-viewer-th");
const nodeFields = [
    "bones",
    "lights",
    "helpers",
    "attachments",
    "collisionShapes",
    "particleEmitters",
    "particleEmitters2",
    "particleEmittersPopcorn",
    "ribbonEmitters",
    "eventObjects",
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

function fixture(withGlow = true): Model {
    const geosets = [0, 1, 2, 5, 3, 4]
        .map(
            (materialId, index) => `
                Geoset {
                    Vertices 3 { { ${index}, 0, 0 }, { ${index + 1}, 0, 0 }, { ${index}, 1, 0 }, }
                    Normals 3 { { 0, 0, 1 }, { 0, 0, 1 }, { 0, 0, 1 }, }
                    TVertices 3 { { 0, 0 }, { 1, 0 }, { 0, 1 }, }
                    VertexGroup { 0, 0, 0, }
                    Faces 1 3 { Triangles { { 0, 1, 2 }, } }
                    Groups 1 1 { Matrices { 1 }, }
                    MaterialID ${materialId},
                    SelectionGroup ${index},
                }
            `,
        )
        .join("\n");
    const model: Model = new parsers.mdlx.Model();
    // 空材質可直接由 MDL 讀入。兩個光暈幾何都在中間，動畫順序刻意不同於幾何順序。
    model.load(`
        Version { FormatVersion 900, }
        Model "隊伍光暈測試" { BlendTime 150, }
        Sequences 1 { Anim "待命" { Interval { 0, 1000 }, } }
        GlobalSequences 1 { Duration 1000, }
        Textures 5 {
            Bitmap { Image "主貼圖.blp", WrapWidth, }
            Bitmap { ReplaceableId 1, Image "", }
            Bitmap { ReplaceableId ${withGlow ? 2 : 0}, Image "", }
            Bitmap { Image "次貼圖.blp", WrapHeight, }
            Bitmap { ReplaceableId ${withGlow ? 2 : 0}, Image "", }
        }
        Materials 6 {
            Material { Layer { FilterMode None, static TextureID 3, static Alpha 0.5, } }
            Material {
                PriorityPlane 2,
                Layer { FilterMode Additive, TwoSided, static TextureID 2, }
                Layer { FilterMode Blend, Unfogged, static TextureID 4, static Alpha 0.75, }
            }
            Material {
                Layer { FilterMode Additive, static TextureID 2, }
                Layer { FilterMode Blend, static TextureID 0, }
            }
            Material { Layer { FilterMode None, static TextureID 1, } }
            Material { PriorityPlane -1, }
            Material { Layer { FilterMode Additive, static TextureID 4, } }
        }
        ${geosets}
        GeosetAnim { static Alpha 0.125, GeosetId 4, }
        GeosetAnim { static Alpha 0.25, GeosetId 1, }
        GeosetAnim { static Alpha 0.375, GeosetId 3, }
        GeosetAnim { static Alpha 0.5, GeosetId 5, }
        GeosetAnim { static Alpha 0.625, GeosetId 2, }
        GeosetAnim { static Alpha 0.75, GeosetId 0, }
        ParticleEmitter2 "粒子" { ObjectId 0, Parent 1, TextureID 0, }
        Bone "光暈甲" { ObjectId 1, GeosetId 1, GeosetAnimId 1, }
        Bone "後方隊伍顏色" { ObjectId 2, Parent 1, GeosetId 4, GeosetAnimId 3, }
        Bone "無指定幾何" { ObjectId 3, Parent 2, GeosetId Multiple, GeosetAnimId None, }
        Bone "光暈乙" { ObjectId 4, Parent 1, GeosetId 3, GeosetAnimId 2, }
        Bone "後方混合" { ObjectId 5, Parent 2, GeosetId 2, GeosetAnimId 0, }
        Bone "前方一般" { ObjectId 6, Parent 1, GeosetId 0, GeosetAnimId 4, }
        Bone "後方空材質" { ObjectId 7, Parent 2, GeosetId 5, GeosetAnimId 5, }
        Helper "輔助" { ObjectId 8, Parent 0, }
        Attachment "附件" { ObjectId 9, Parent 8, AttachmentID 0, }
        Light "光源" { ObjectId 10, Parent 1, Omnidirectional, }
        CollisionShape "碰撞" { ObjectId 11, Parent 1, Sphere, BoundsRadius 2, }
        PivotPoints 12 {
            ${Array.from({ length: 12 }, (_, id) => `{ ${id + 0.25}, ${id + 0.5}, ${id + 0.75} },`).join("\n")}
        }
    `);
    return model;
}

function readModel(bytes: Uint8Array): Model {
    const model: Model = new parsers.mdlx.Model();
    model.load(bytes);
    return model;
}

function boundaryFixture(withGlow = true): Model {
    const model = fixture(withGlow);
    model.geosetAnimations[0].geosetId = -1;
    model.geosetAnimations[3].geosetId = 999;
    model.bones[1].geosetId = 999;
    model.bones[4].geosetAnimationId = 777;
    return readModel(model.saveMdx());
}

function unchangedSnapshot(model: Model) {
    return structuredClone({
        materials: model.materials,
        textures: model.textures,
        sequences: model.sequences,
        globalSequences: model.globalSequences,
        pivots: model.pivotPoints,
        nodes: nodeFields.map((field) =>
            model[field].map((node: GenericObject) => {
                const { geosetId, geosetAnimationId, ...rest } = node as Model["bones"][number];
                return rest;
            }),
        ),
    });
}

verify("T7 假模型包含一般、純光暈、混合、隊伍顏色與空材質幾何。", () => {
    const model = fixture();
    assert.deepEqual(
        model.textures.map((texture) => texture.replaceableId),
        [0, 1, 2, 0, 2],
    );
    assert.deepEqual(
        model.materials.map((material) => material.layers.map((layer) => layer.textureId)),
        [[3], [2, 4], [2, 0], [1], [], [4]],
    );
    assert.deepEqual(
        model.geosets.map((geoset) => geoset.materialId),
        [0, 1, 2, 5, 3, 4],
    );
    assert.deepEqual(
        model.geosets.map((geoset) => geoset.vertices[0]),
        [0, 1, 2, 3, 4, 5],
    );
    assert.deepEqual(
        model.geosetAnimations.map((animation) => animation.geosetId),
        [4, 1, 3, 5, 2, 0],
    );
    assert.deepEqual(
        model.bones.map((bone) => bone.geosetId),
        [1, 4, -1, 3, 2, 0, 5],
    );
    assert.deepEqual(
        model.bones.map((bone) => bone.geosetAnimationId),
        [1, 3, -1, 2, 0, 4, 5],
    );
    assert.equal(model.pivotPoints.length, 12, "假模型應有十二個 pivot。");
});

verify("T7 假模型可儲存為 MDX 並讀回，全部位元組相同。", () => {
    const model = fixture();
    assert.deepEqual(readModel(model.saveMdx()).saveMdx(), model.saveMdx());
    assert.equal(
        readModel(model.saveMdx()).materials[4].layers.length,
        0,
        "空材質讀回後仍應沒有圖層。",
    );
});

// 先驗證假模型，再載入使用者將實作的函式。缺少匯出時，每組測試各自記錄失敗。
const { stripTeamGlow, stripEffects, makeUnshaded, buildPreviewHero } =
    require("../../scripts/preview-model.cjs") as {
        stripTeamGlow?: (model: Model) => Model;
        stripEffects: (model: Model) => Model;
        makeUnshaded: (model: Model) => Model;
        buildPreviewHero: (bytes: Uint8Array, options: { unshaded: boolean }) => Uint8Array;
    };

function applyTeamGlow(model: Model): Model {
    assert.equal(typeof stripTeamGlow, "function", "預期模組匯出 stripTeamGlow 函式。");
    return stripTeamGlow!(model);
}

verify("模組匯出 stripTeamGlow 函式。", () => {
    assert.equal(typeof stripTeamGlow, "function", "預期模組匯出 stripTeamGlow 函式。");
});

verify("stripTeamGlow 回傳原本的 Model 物件。", () => {
    const model = fixture();
    assert.equal(applyTeamGlow(model), model, "stripTeamGlow 應回傳傳入的同一個 Model 物件。");
});

for (const roundTrip of [false, true]) {
    const stage = roundTrip ? "MDX 讀回後" : "處理後";
    function result(): Model {
        const model = fixture();
        applyTeamGlow(model);
        return roundTrip ? readModel(model.saveMdx()) : model;
    }

    verify(`${stage}移除全部純光暈幾何，其餘幾何內容與順序不變。`, () => {
        const original = fixture();
        const expected = structuredClone([0, 2, 4, 5].map((id) => original.geosets[id]));
        assert.deepEqual(
            structuredClone(result().geosets),
            expected,
            "應保留一般、混合、隊伍顏色與空材質幾何。",
        );
    });

    verify(`${stage}移除光暈幾何動畫，其餘動畫依新幾何編號更新。`, () => {
        const original = fixture();
        const expected = structuredClone([0, 3, 4, 5].map((id) => original.geosetAnimations[id]));
        [2, 3, 1, 0].forEach((geosetId, index) => {
            expected[index].geosetId = geosetId;
        });
        assert.deepEqual(
            structuredClone(result().geosetAnimations),
            expected,
            "應保留動畫順序與內容，僅更新 geosetId。",
        );
    });

    verify(`${stage}骨骼的 geosetId 更新，移除項目改為 -1，原有 -1 不變。`, () => {
        assert.deepEqual(
            result().bones.map((bone) => bone.geosetId),
            [-1, 2, -1, -1, 1, 0, 3],
            "骨骼應使用新的幾何編號。",
        );
    });

    verify(`${stage}骨骼的 geosetAnimationId 更新，移除項目改為 -1，原有 -1 不變。`, () => {
        assert.deepEqual(
            result().bones.map((bone) => bone.geosetAnimationId),
            [-1, 1, -1, -1, 0, 2, 3],
            "骨骼應使用新的幾何動畫編號。",
        );
    });

    function boundaryResult(): Model {
        const model = boundaryFixture();
        applyTeamGlow(model);
        const actual = roundTrip ? readModel(model.saveMdx()) : model;
        assert.equal(actual.geosets.length, 4, "邊界值不得阻止移除兩個光暈幾何。");
        return actual;
    }

    verify(`${stage}保留 geosetId 為 -1 與 999 的幾何動畫，內容與順序不變。`, () => {
        const original = boundaryFixture();
        const expected = structuredClone([0, 3, 4, 5].map((id) => original.geosetAnimations[id]));
        [1, 0].forEach((geosetId, index) => {
            expected[index + 2].geosetId = geosetId;
        });
        assert.deepEqual(
            structuredClone(boundaryResult().geosetAnimations),
            expected,
            "邊界動畫應保留原值與內容，有效幾何編號仍應更新。",
        );
    });

    verify(`${stage}骨骼的 geosetId 為 999 時保留原值，其餘幾何編號依規則更新。`, () => {
        assert.deepEqual(
            boundaryResult().bones.map((bone) => bone.geosetId),
            [-1, 999, -1, -1, 1, 0, 3],
            "超出範圍的骨骼幾何編號應保持不變。",
        );
    });

    verify(`${stage}骨骼的 geosetAnimationId 為 777 時保留原值，其餘動畫編號依規則更新。`, () => {
        assert.deepEqual(
            boundaryResult().bones.map((bone) => bone.geosetAnimationId),
            [-1, 1, -1, -1, 777, 2, 3],
            "超出範圍的骨骼幾何動畫編號應保持不變。",
        );
    });
}

verify("材質、貼圖、全部節點、pivot、序列與全域序列保持不變。", () => {
    const model = fixture();
    const before = unchangedSnapshot(model);
    applyTeamGlow(model);
    assert.deepEqual(
        unchangedSnapshot(model),
        before,
        "除骨骼的兩個幾何關聯欄位外，節點與資源應保持不變。",
    );
});

verify("沒有隊伍光暈幾何時，回傳原物件且全部 MDX 位元組不變。", () => {
    const model = fixture(false);
    const before = new Uint8Array(model.saveMdx());
    assert.equal(applyTeamGlow(model), model);
    assert.deepEqual(model.saveMdx(), before, "沒有光暈時，模型內容應完全不變。");
});

verify("沒有隊伍光暈幾何且有邊界值時，全部 MDX 位元組與讀回結果不變。", () => {
    const model = boundaryFixture(false);
    const before = new Uint8Array(model.saveMdx());
    assert.equal(model.geosetAnimations[0].geosetId, -1);
    assert.equal(model.geosetAnimations[3].geosetId, 999);
    assert.equal(model.bones[1].geosetId, 999);
    assert.equal(model.bones[4].geosetAnimationId, 777);
    assert.equal(applyTeamGlow(model), model);
    const after = model.saveMdx();
    assert.deepEqual(after, before, "沒有光暈時，不得變更邊界值或其他模型內容。");
    assert.deepEqual(readModel(after).saveMdx(), before, "MDX 讀回後的全部位元組應保持不變。");
});

verify("重複呼叫兩次的結果與呼叫一次相同。", () => {
    const model = fixture();
    applyTeamGlow(model);
    const once = new Uint8Array(model.saveMdx());
    assert.equal(applyTeamGlow(model), model, "第二次呼叫應回傳同一個 Model。");
    assert.deepEqual(model.saveMdx(), once, "第二次呼叫不得再次移除幾何或變更編號。");
});

for (const unshaded of [true, false]) {
    verify(`unshaded 為 ${unshaded} 時，建置等於依序移除效果、移除光暈與設定光照的結果。`, () => {
        const bytes = new Uint8Array(fixture().saveMdx());
        const before = new Uint8Array(bytes);
        const expected = readModel(bytes);
        stripEffects(expected);
        applyTeamGlow(expected);
        if (unshaded) {
            makeUnshaded(expected);
        }
        const actual = buildPreviewHero(bytes, { unshaded });
        assert.ok(actual instanceof Uint8Array, "建置結果應為 Uint8Array。");
        assert.deepEqual(bytes, before, "建置不得修改輸入位元組。");
        assert.deepEqual(
            actual,
            new Uint8Array(expected.saveMdx()),
            "建置的全部 MDX 位元組應符合 T7 處理流程。",
        );
    });
}

console.log(`英雄預覽 T7 測試共 ${count} 組通過，${failures} 組失敗。`);
if (failures > 0) {
    process.exitCode = 1;
}
