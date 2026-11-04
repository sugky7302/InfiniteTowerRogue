import { strict as assert } from "node:assert";
import type Model from "mdx-m3-viewer-th/dist/cjs/parsers/mdlx/model";

const { parsers } = require("mdx-m3-viewer-th");
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

function fixture(): Model {
    const model: Model = new parsers.mdlx.Model();
    // layer.js 支援 static Alpha 與 Alpha 動畫。KMTA 軌道存放於 animations，alpha 仍是靜態值。
    model.load(`
        Version { FormatVersion 900, }
        Model "不受光照測試" { BlendTime 150, }
        Sequences 1 { Anim "待命" { Interval { 0, 1000 }, } }
        GlobalSequences 1 { Duration 1000, }
        Textures 3 {
            Bitmap { Image "主貼圖.blp", }
            Bitmap { Image "次貼圖.blp", }
            Bitmap { ReplaceableId 1, Image "", }
        }
        Materials 2 {
            Material {
                PriorityPlane 2,
                ConstantColor,
                Layer { FilterMode None, static TextureID 0, static Alpha 0.5, }
            }
            Material {
                PriorityPlane -1,
                SortPrimsFarZ,
                Layer { FilterMode Blend, Unshaded, static TextureID 1, static Alpha 0.75, }
                Layer {
                    FilterMode Additive,
                    SphereEnvMap, TwoSided, Unfogged,
                    static TextureID 2,
                    Alpha 2 {
                        Hermite,
                        GlobalSeqId 0,
                        0: 0.25,
                            InTan 0.125,
                            OutTan 0.5,
                        1000: 0.75,
                            InTan 0.5,
                            OutTan 0.875,
                    }
                }
                Layer {
                    FilterMode Transparent,
                    Unshaded, SphereEnvMap, TwoSided, Unfogged,
                    static TextureID 1,
                    static Alpha 0.25,
                }
            }
        }
        Geoset {
            Vertices 3 { { 0, 0, 0 }, { 1, 0, 0 }, { 0, 1, 0 }, }
            Normals 3 { { 0, 0, 1 }, { 0, 0, 1 }, { 0, 0, 1 }, }
            TVertices 3 { { 0, 0 }, { 1, 0 }, { 0, 1 }, }
            VertexGroup { 0, 0, 0, }
            Faces 1 3 { Triangles { { 0, 1, 2 }, } }
            Groups 1 1 { Matrices { 0 }, }
            MaterialID 1,
            SelectionGroup 0,
        }
        Bone "主骨骼" { ObjectId 0, GeosetId 0, GeosetAnimId None, }
        Helper "輔助" { ObjectId 1, Parent 0, }
        Attachment "附件" { ObjectId 2, Parent 1, AttachmentID 0, }
        Light "光源" { ObjectId 3, Parent 0, Omnidirectional, }
        CollisionShape "碰撞" { ObjectId 4, Parent 0, Sphere, BoundsRadius 2, }
        ParticleEmitter "舊式粒子" { ObjectId 5, Parent 0, }
        ParticleEmitter2 "粒子" { ObjectId 6, Parent 0, TextureID 0, }
        ParticleEmitterPopcorn "爆米花粒子" { ObjectId 7, Parent 0, }
        RibbonEmitter "緞帶" { ObjectId 8, Parent 0, MaterialID 0, }
        EventObject "事件" { ObjectId 9, Parent 0, EventTrack 1 { 100, } }
        PivotPoints 10 {
            { 0.25, 0.5, 0.75 }, { 1, 2, 3 }, { 2, 3, 4 }, { 3, 4, 5 }, { 4, 5, 6 },
            { 5, 6, 7 }, { 6, 7, 8 }, { 7, 8, 9 }, { 8, 9, 10 }, { 9, 10, 11 },
        }
    `);
    return model;
}

function reload(model: Model): Model {
    const result: Model = new parsers.mdlx.Model();
    result.load(model.saveMdx());
    return result;
}

function layerFlags(model: Model): number[][] {
    return model.materials.map((material) => material.layers.map((layer) => layer.flags));
}

function materialSnapshot(model: Model) {
    return model.materials.map((material) => ({
        flags: material.flags,
        priorityPlane: material.priorityPlane,
        shader: material.shader,
        layers: material.layers.map((layer) => ({
            filterMode: layer.filterMode,
            textureId: layer.textureId,
            alpha: layer.alpha,
            // 複製動畫及型別化陣列，避免原地修改同時改到預期值。
            animations: structuredClone(layer.animations),
        })),
    }));
}

verify("T2 的 MDL 假模型包含不同圖層數、旗標、貼圖、混合模式與 Alpha 資料。", () => {
    const model = fixture();
    assert.equal(model.materials.length, 2, "假模型應有兩個材質。");
    assert.deepEqual(
        layerFlags(model),
        [[0x0], [0x1, 0x32, 0x33]],
        "兩個材質應各有一層與三層，涵蓋零旗標、已有 0x1 與其他位元的組合。",
    );
    assert.deepEqual(
        model.materials.map((material) => material.layers.map((layer) => layer.filterMode)),
        [[0], [2, 3, 1]],
        "圖層的 filterMode 應依序不同。",
    );
    assert.deepEqual(
        model.materials.map((material) => material.layers.map((layer) => layer.textureId)),
        [[0], [1, 2, 1]],
        "圖層應使用三個不同的 textureId。",
    );
    assert.deepEqual(
        model.materials.map((material) => material.layers.map((layer) => layer.alpha)),
        [[0.5], [0.75, 1, 0.25]],
        "靜態 Alpha 應保留指定值，動畫圖層的靜態 Alpha 應為預設值 1。",
    );
    assert.deepEqual(
        model.materials.map((material) => material.layers.map((layer) => layer.animations.length)),
        [[0], [0, 1, 0]],
        "只有第二個材質的第二層應有動畫軌道。",
    );
    const animation = model.materials[1].layers[1].animations[0];
    assert.equal(animation.name, "KMTA", "動畫應為 Alpha 軌道 KMTA。");
    assert.equal(animation.interpolationType, 2, "動畫應使用 Hermite 插值。");
    assert.equal(animation.globalSequenceId, 0, "動畫應使用全域序列 0。");
    assert.deepEqual(animation.frames, [0, 1000], "動畫應保留兩個影格。");
    for (const [field, expected] of [
        ["values", [[0.25], [0.75]]],
        ["inTans", [[0.125], [0.5]]],
        ["outTans", [[0.5], [0.875]]],
    ] as const) {
        assert.deepEqual(
            animation[field].map((value) => Array.from(value)),
            expected,
            `動畫的 ${field} 應符合 MDL 設定。`,
        );
    }
    for (const field of [
        "bones",
        "helpers",
        "attachments",
        "lights",
        "collisionShapes",
        "particleEmitters",
        "particleEmitters2",
        "particleEmittersPopcorn",
        "ribbonEmitters",
        "eventObjects",
        "geosets",
        "sequences",
        "globalSequences",
    ] as const) {
        assert.equal(model[field].length, 1, `假模型的 ${field} 應有一個項目。`);
    }
    assert.equal(model.textures.length, 3, "假模型應有三個貼圖。");
    assert.equal(model.pivotPoints.length, 10, "假模型應有十個 pivot。");
});

verify("T2 的假模型可儲存為 MDX 並讀回，全部位元組相同。", () => {
    const model = fixture();
    assert.deepEqual(reload(model).saveMdx(), model.saveMdx(), "假模型的 MDX 讀回結果應相同。");
});

// 先驗證假模型，再載入使用者將實作的模組。
const {
    makeUnshaded,
}: { makeUnshaded?: (model: Model) => Model } = require("../../scripts/preview-model.cjs");

function applyUnshaded(model: Model): Model {
    assert.equal(typeof makeUnshaded, "function", "預期模組匯出 makeUnshaded 函式。");
    return makeUnshaded!(model);
}

verify("模組匯出 makeUnshaded 函式。", () => {
    assert.equal(typeof makeUnshaded, "function", "預期模組匯出 makeUnshaded 函式。");
});

verify("makeUnshaded 回傳原本的 Model 物件。", () => {
    const model = fixture();
    assert.equal(applyUnshaded(model), model, "makeUnshaded 應回傳傳入的同一個 Model 物件。");
});

function verifyUnshaded(stage: string, roundTrip: boolean): void {
    function result(model: Model): Model {
        applyUnshaded(model);
        return roundTrip ? reload(model) : model;
    }

    verify(`${stage}的每個材質圖層都有 0x1。`, () => {
        const model = fixture();
        const expected = layerFlags(model).map((flags) => flags.map(() => 0x1));
        assert.deepEqual(
            layerFlags(result(model)).map((flags) => flags.map((flag) => flag & 0x1)),
            expected,
            `${stage}的全部圖層都應設定不受光照旗標。`,
        );
    });

    verify(`${stage}的其他旗標位元不變。`, () => {
        const model = fixture();
        const expected = layerFlags(model).map((flags) => flags.map((flag) => flag & ~0x1));
        assert.deepEqual(
            layerFlags(result(model)).map((flags) => flags.map((flag) => flag & ~0x1)),
            expected,
            `${stage}除 0x1 外的旗標位元應保持原值。`,
        );
    });

    verify(`${stage}原有 0x1 的圖層旗標完全不變。`, () => {
        const model = fixture();
        const before = layerFlags(model);
        const after = layerFlags(result(model));
        before.forEach((flags, materialIndex) => {
            flags.forEach((flag, layerIndex) => {
                if ((flag & 0x1) !== 0) {
                    assert.equal(
                        after[materialIndex][layerIndex],
                        flag,
                        `${stage}材質 ${materialIndex} 的圖層 ${layerIndex} 已有 0x1，旗標應完全不變。`,
                    );
                }
            });
        });
    });

    verify(`${stage}的材質與圖層數量、順序、混合模式、貼圖及 Alpha 動畫不變。`, () => {
        const model = fixture();
        const before = materialSnapshot(model);
        assert.deepEqual(
            materialSnapshot(result(model)),
            before,
            `${stage}的材質設定、圖層順序、filterMode、textureId、alpha 與完整動畫軌道應保持原值。`,
        );
    });
}

verifyUnshaded("處理後", false);
verifyUnshaded("MDX 讀回後", true);

verify("除圖層旗標外，全部 MDX 內容不變。", () => {
    const model = fixture();
    const before = new Uint8Array(model.saveMdx());
    const flags = layerFlags(model);
    applyUnshaded(model);
    // 只在獨立複本還原圖層旗標，再比較全部位元組。原測試結果保持不變。
    const copy = reload(model);
    copy.materials.forEach((material, materialIndex) => {
        material.layers.forEach((layer, layerIndex) => {
            layer.flags = flags[materialIndex][layerIndex];
        });
    });
    assert.deepEqual(
        copy.saveMdx(),
        before,
        "除圖層旗標外，材質設定、節點、效果、幾何、貼圖、序列、全域序列與 pivot 的位元組應相同。",
    );
});

verify("重複呼叫兩次的結果與呼叫一次相同。", () => {
    const model = fixture();
    applyUnshaded(model);
    const once = new Uint8Array(model.saveMdx());
    assert.equal(applyUnshaded(model), model, "第二次呼叫仍應回傳同一個 Model 物件。");
    assert.deepEqual(model.saveMdx(), once, "第二次呼叫後的全部 MDX 位元組應與第一次相同。");
});

verify("沒有材質時不丟錯誤，回傳原物件且全部內容不變。", () => {
    const model = fixture();
    model.materials = [];
    const before = new Uint8Array(model.saveMdx());
    assert.doesNotThrow(() => {
        assert.equal(applyUnshaded(model), model, "沒有材質時應回傳同一個 Model 物件。");
    }, "沒有材質時應可完成處理。");
    assert.equal(model.materials.length, 0, "沒有材質時不應新增材質。");
    assert.deepEqual(model.saveMdx(), before, "沒有材質時，全部 MDX 位元組應保持不變。");
});

console.log(`英雄預覽 T2 測試共 ${count} 組通過，${failures} 組失敗。`);
if (failures > 0) {
    process.exitCode = 1;
}
