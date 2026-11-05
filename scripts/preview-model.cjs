const { parsers } = require("mdx-m3-viewer-th");

/**
 * @title 移除效果節點
 * 移除 `particleEmitters`、`particleEmitters2`、`particleEmittersPopcorn`、`ribbonEmitters`、`eventObjects`。
 * 其他節點（骨骼、輔助節點、附件點、光源、碰撞形狀）保留，順序不變。
 * 節點編號（`objectId`）重新編號為連續的 0、1、2……；每個節點的 `parentId` 改為新編號；父節點被移除時改為 `-1`。
 * `pivotPoints` 依新編號重新排列，長度等於節點數量。
 * 幾何的骨骼矩陣群組（`matrixGroups`／`matrixIndices`）指向的骨骼編號改為新編號。
 * 幾何、材質、貼圖、序列、全域序列的數量不變。
 * @param {parsers.mdlx.Model} model
 */
function stripEffects(model) {
    // 確認要保留的節點
    const kept = [
        ...model.bones,
        ...model.lights,
        ...model.helpers,
        ...model.attachments,
        ...model.collisionShapes,
    ];
    // 記錄舊編號對應的新編號
    const oldToNewId = new Map();
    kept.forEach((node, idx) => oldToNewId.set(node.objectId, idx));

    // 先檢查幾何的骨骼矩陣群組有沒有指向被移除的骨骼
    const newMatrixIndices = new Array(model.geosets.length);
    model.geosets.forEach((geo, i) => {
        // 先檢查並算出新編號，暫存起來，不修改模型。
        // 全部幾何都通過後才套用，讓出錯時模型保持不變。
        newMatrixIndices[i] = geo.matrixIndices.map((oldId, j) => {
            if (!oldToNewId.has(oldId)) {
                throw new Error(
                    `第 ${i} 個幾何的第 ${j} 個矩陣項目：舊節點編號 ${oldId} 找不到保留的節點`,
                );
            }

            return oldToNewId.get(oldId);
        });
    });

    // 按照新編號重新排列 PivotPoints
    model.pivotPoints = kept.map((node) => model.pivotPoints[node.objectId]);

    // 每個物件在 Model 是一個陣列，把陣列清空就是移除物件
    // 粒子效果
    model.particleEmitters = [];
    model.particleEmitters2 = [];
    model.particleEmittersPopcorn = [];
    // 緞帶發射器
    model.ribbonEmitters = [];
    // 事件物件
    model.eventObjects = [];

    // 更新節點編號
    kept.forEach((node) => {
        node.objectId = oldToNewId.get(node.objectId);

        if (node.parentId !== -1) {
            node.parentId = oldToNewId.get(node.parentId) ?? -1;
        }
    });

    model.geosets.forEach((geo, i) => {
        geo.matrixIndices = newMatrixIndices[i];
    });

    return model;
}

/**
 * @title 設為不受光照
 * 將每個材質圖層設為不受光照。設定 flags 的 bit 0（Unshaded），保留其他旗標位元。
 * 圖層數量、`filterMode`、`textureId`、`alpha` 不變。
 * @param {parsers.mdlx.Model} model
 */
function makeUnshaded(model) {
    model.materials.forEach((mat) => {
        mat.layers.forEach((layer) => {
            layer.flags |= 0x1;
        });
    });

    return model;
}

/**
 * @title 建置副本
 * @param {*} bytes 傳入的模型檔案位元組陣列，不得修改。
 * @param {boolean} options.unshaded 是否將材質設為不受光照
 * @returns {Uint8Array} 回傳新的模型檔案位元組陣列
 */
function buildPreviewHero(bytes, { unshaded = false } = {}) {
    // 讀取模型
    const model = new parsers.mdlx.Model();
    model.load(bytes);

    // 移除效果節點
    stripEffects(model);

    // 移除隊伍光暈幾何
    stripTeamGlow(model);

    // 設為不受光照
    if (unshaded) {
        makeUnshaded(model);
    }

    // 回傳新的模型檔案位元組陣列
    return model.saveMdx();
}

/* 依對照表換算編號，不在表中時保留原值 */
const remap = (mapping, id) => (mapping.has(id) ? mapping.get(id) : id);

/**
 * @title 移除隊伍光暈幾何
 * 移除全部隊伍光暈幾何。其他幾何保留，順序不變。
 * 沒有隊伍光暈幾何時，模型不變。
 * 這個函數採用先判斷後修改，保證傳入 model 有問題時，不會一半有改，一半沒改。
 * @param {parsers.mdlx.Model} model
 * @returns {parsers.mdlx.Model} 回傳修改後的模型
 */
function stripTeamGlow(model) {
    // 建立幾何的編號對照表
    const geoMapping = new Map();
    let newGeoId = 0;

    // 判斷是否有隊伍光暈幾何，不做移除動作，防止 filter 做一半出錯，讓 model 變成不完整。
    model.geosets.forEach((geo, idx) => {
        const material = model.materials[geo.materialId];
        const hasLayers = material.layers.length > 0;
        const allTeamGlow = material.layers.every(
            (layer) => model.textures[layer.textureId].replaceableId === 2,
        );

        if (hasLayers && allTeamGlow) {
            geoMapping.set(idx, -1); // 記錄為已移除
        } else {
            geoMapping.set(idx, newGeoId++);
        }
    });

    if (newGeoId === model.geosets.length) {
        // 沒有隊伍光暈幾何，模型不變
        return model;
    }

    // 建立幾何動畫的編號對照表
    const geoAnimMapping = new Map();
    let newGeoAnimId = 0;

    // 判斷幾何動畫是否有對應的幾何被移除。
    model.geosetAnimations.forEach((geoAnim, idx) => {
        if (geoMapping.get(geoAnim.geosetId) === -1) {
            geoAnimMapping.set(idx, -1); // 記錄為已移除
        } else {
            geoAnimMapping.set(idx, newGeoAnimId++);
        }
    });

    // 更新骨骼的幾何編號與幾何動畫編號
    model.bones.forEach((bone) => {
        bone.geosetId = remap(geoMapping, bone.geosetId);
        bone.geosetAnimationId = remap(geoAnimMapping, bone.geosetAnimationId);
    });

    // 更新模型的幾何與幾何動畫
    model.geosets = model.geosets.filter((_, idx) => geoMapping.get(idx) !== -1);
    model.geosetAnimations = model.geosetAnimations.filter((geoAnim, idx) => {
        if (geoAnimMapping.get(idx) !== -1) {
            geoAnim.geosetId = remap(geoMapping, geoAnim.geosetId);
            return true;
        }
        return false;
    });

    return model;
}

module.exports = {
    stripEffects,
    makeUnshaded,
    buildPreviewHero,
    stripTeamGlow,
};
