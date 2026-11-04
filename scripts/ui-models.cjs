// 產生正式物品欄的英雄預覽包裝模型。
// 遊戲內確認（2026-11-04）：SPRITE 從模型 +Z 方向往下看，忽略模型中的鏡頭與光源；附件的 Path 模型會顯示。
// 所以以輔助節點轉動附件：模型的上方（+Z）朝畫面上方，正面（+X）朝玩家。SPRITE 沒有旋轉原生函式，
// turnRotation 保留角度參數，以便之後需要其他角度。
const fs = require("fs");
const path = require("path");
const { parsers } = require("mdx-m3-viewer-th");

const turnCount = 16;

function multiply(a, b) {
    return a.map((row) =>
        [0, 1, 2].map((column) => row.reduce((sum, value, k) => sum + value * b[k][column], 0)),
    );
}

function quaternion(m) {
    // 旋轉矩陣轉四元數（x, y, z, w）。
    const trace = m[0][0] + m[1][1] + m[2][2];
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        return [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
    }
    if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
        const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
        return [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
    }
    if (m[1][1] > m[2][2]) {
        const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
        return [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
    }
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    return [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
}

/** 角度 0 看正面。角度以模型的垂直軸逆時針計算。 */
function turnRotation(index) {
    const angle = (index / turnCount) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const yaw = [
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1],
    ];
    // 畫面座標：右＝X，上＝Y，朝玩家＝Z。模型的 Y→畫面 X，Z→畫面 Y，X→畫面 Z。
    const front = [
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 0],
    ];
    return quaternion(multiply(front, yaw));
}

function previewMdl(heroModel, index) {
    const q = turnRotation(index)
        .map((value) => value.toFixed(6))
        .join(", ");
    return (
        `Version {\n\tFormatVersion 800,\n}\n` +
        `Model "ItrHeroPreview" {\n\tNumHelpers 1,\n\tNumAttachments 1,\n\tBlendTime 150,\n\tMinimumExtent { -150, 0, -150 },\n\tMaximumExtent { 150, 250, 150 },\n}\n` +
        `Sequences 1 {\n\tAnim "Stand" {\n\t\tInterval { 0, 1000 },\n\t}\n}\n` +
        `Helper "Turn" {\n\tObjectId 0,\n\tRotation 1 {\n\t\tDontInterp,\n\t\t0: { ${q} },\n\t}\n}\n` +
        `Attachment "Hero" {\n\tObjectId 1,\n\tParent 0,\n\tAttachmentID 0,\n\tPath "${heroModel}",\n}\n` +
        `PivotPoints 2 {\n\t{ 0, 0, 0 },\n\t{ 0, 0, 0 },\n}\n`
    );
}

/** 寫入建置地圖的 ui 資料夾：只產生正面的 itr-hero-preview.mdx。使用者決定不需要旋轉（2026-11-04）。 */
function writePreviewModels(uiFolder, heroModel) {
    const model = new parsers.mdlx.Model();
    model.load(previewMdl(heroModel, 0));
    fs.writeFileSync(path.join(uiFolder, "itr-hero-preview.mdx"), Buffer.from(model.saveMdx()));
}

module.exports = { turnCount, turnRotation, previewMdl, writePreviewModels };
