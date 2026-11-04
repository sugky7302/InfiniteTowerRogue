/**
 * @title 移除效果節點
 * 移除 `particleEmitters`、`particleEmitters2`、`particleEmittersPopcorn`、`ribbonEmitters`、`eventObjects`。
 * 其他節點（骨骼、輔助節點、附件點、光源、碰撞形狀）保留，順序不變。
 * 節點編號（`objectId`）重新編號為連續的 0、1、2……；每個節點的 `parentId` 改為新編號；父節點被移除時改為 `-1`。
 * `pivotPoints` 依新編號重新排列，長度等於節點數量。
 * 幾何的骨骼矩陣群組（`matrixGroups`／`matrixIndices`）指向的骨骼編號改為新編號。
 * 幾何、材質、貼圖、序列、全域序列的數量不變。
 * @param {import("mdx-m3-viewer-th").parsers.mdlx.Model} model
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
 * @title 移除模型的陰影效果
 * 將每個材質圖層設為不受光照。設定 flags 的 bit 0（Unshaded），保留其他旗標位元。
 * 圖層數量、`filterMode`、`textureId`、`alpha` 不變。
 * @param {import("mdx-m3-viewer-th").parsers.mdlx.Model} model
 */
function makeUnshaded(model) {
    model.materials.forEach((mat) => {
        mat.layers.forEach((layer) => {
            layer.flags |= 0x1;
        });
    });

    return model;
}

function buildPreviewHero(bytes, options) {}

module.exports = {
    stripEffects,
    makeUnshaded,
    // buildPreviewHero,
};
