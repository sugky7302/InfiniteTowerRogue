// 產生正式物品欄的英雄預覽包裝模型。
// 遊戲內確認（2026-11-04）：SPRITE 從模型 +Z 方向往下看，忽略模型中的鏡頭與光源；附件的 Path 模型會顯示。
// 所以以輔助節點轉動附件：模型的上方（+Z）朝畫面上方，正面（+X）朝玩家。SPRITE 沒有旋轉原生函式，
// turnRotation 保留角度參數，以便之後需要其他角度。
const fs = require("fs");
const path = require("path");
const { parsers } = require("mdx-m3-viewer-th");
const { buildPreviewHero } = require("./preview-model.cjs");

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

/**
 * @typedef {Object} PreviewOptions
 * @property {boolean} [unshaded] 是否將材質設為不受光照。未設定時由 ITR_PREVIEW_UNSHADED 決定：值是 0 時為 false，其他情況為 true。
 * @property {string} [source] 來源模型檔案路徑。
 * @property {(message:string) => void} [warn] 警告訊息輸出函式，預設為 console.warn
 */

/**
 * @title 寫入建置地圖的 ui 資料夾
 * 產生英雄複本（有來源時）與正面的 itr-hero-preview.mdx。
 * @param {string} uiFolder UI 資料夾路徑
 * @param {string} heroModel 英雄模型路徑
 * @param {PreviewOptions} options 選項
 * @returns {string} 回傳使用的附件模型路徑
 */
function writePreviewModels(uiFolder, heroModel, options = {}) {
    // 如果沒有設定 unshaded，則從環境變數讀取，預設為 true
    // 解構時，若是沒有值才會取得預設值，因此相當於 options.unshaded === undefined 時才會使用預設值
    const {
        unshaded = process.env.ITR_PREVIEW_UNSHADED !== "0",
        source = "assets/models/hero-archmage.mdx",
        warn = console.warn,
    } = options;

    // 讀取來源模型，若來源模型不存在則使用 heroModel
    let attachmentModel = heroModel;
    let copyBytes = null;
    if (fs.existsSync(source)) {
        copyBytes = buildPreviewHero(fs.readFileSync(source), { unshaded });
        attachmentModel = "ui\\itr-hero-archmage-unshaded.mdx";
    } else {
        warn(`來源模型檔案不存在 "${source}"，將使用原始模型 "${heroModel}"`);
        attachmentModel = heroModel;
    }

    // 用附件路徑產生包裝模型的位元組
    const model = new parsers.mdlx.Model();
    model.load(previewMdl(attachmentModel, 0));
    // 把包裝模型轉成位元組陣列。全部成功後才寫入檔案，避免中途寫入不完整檔案。
    const previewBytes = model.saveMdx();

    // 寫入副本
    if (copyBytes) {
        fs.writeFileSync(
            path.join(uiFolder, "itr-hero-archmage-unshaded.mdx"),
            Buffer.from(copyBytes),
        );
    }
    // 寫入預覽模型
    fs.writeFileSync(path.join(uiFolder, "itr-hero-preview.mdx"), Buffer.from(previewBytes));

    return attachmentModel;
}

module.exports = { turnCount, turnRotation, previewMdl, writePreviewModels };
