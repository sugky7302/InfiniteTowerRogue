// I3 實驗：產生英雄預覽的包裝模型。SPRITE 沒有旋轉原生函式，所以以 16 個鏡頭環繞模型，鏡頭編號即角度。
// 單位模型面向 +X，所以鏡頭 0 看正面。附件以 Path 載入英雄模型。
const fs = require("fs");
const path = require("path");
const { parsers } = require("mdx-m3-viewer-th");

const cameraCount = 16;

function previewMdl(heroModel, withLight, withCameras = true) {
    const cameras = [];
    for (let index = 0; index < (withCameras ? cameraCount : 0); index++) {
        const angle = (index / cameraCount) * Math.PI * 2;
        const x = (Math.cos(angle) * 420).toFixed(2);
        const y = (Math.sin(angle) * 420).toFixed(2);
        cameras.push(
            `Camera "View${index}" {\n\tPosition { ${x}, ${y}, 110 },\n\tFieldOfView 0.6,\n\tFarClip 3000,\n\tNearClip 8,\n\tTarget {\n\t\tPosition { 0, 0, 90 },\n\t}\n}`,
        );
    }
    const light = withLight
        ? `Light "Key" {\n\tObjectId 1,\n\tOmnidirectional,\n\tstatic AttenuationStart 0,\n\tstatic AttenuationEnd 3000,\n\tstatic Intensity 1.5,\n\tstatic Color { 1, 1, 1 },\n\tstatic AmbIntensity 0.8,\n\tstatic AmbColor { 1, 1, 1 },\n}\n`
        : "";
    return (
        `Version {\n\tFormatVersion 800,\n}\n` +
        `Model "ItrHeroPreview" {\n\tNumAttachments 1,\n${withLight ? "\tNumLights 1,\n" : ""}\tBlendTime 150,\n\tMinimumExtent { -120, -120, 0 },\n\tMaximumExtent { 120, 120, 220 },\n}\n` +
        `Sequences 1 {\n\tAnim "Stand" {\n\t\tInterval { 0, 1000 },\n\t}\n}\n` +
        `Attachment "Hero" {\n\tObjectId 0,\n\tAttachmentID 0,\n\tPath "${heroModel}",\n}\n` +
        light +
        `PivotPoints ${withLight ? 2 : 1} {\n\t{ 0, 0, 0 },\n${withLight ? "\t{ 300, 0, 300 },\n" : ""}}\n` +
        cameras.join("\n") +
        "\n"
    );
}

/** 寫入建置地圖的 ui 資料夾。 */
function writePreviewModels(uiFolder, heroModel) {
    for (const [name, withLight, withCameras] of [
        ["itr-hero-preview.mdx", true, true],
        ["itr-hero-preview-dark.mdx", false, true],
        ["itr-hero-preview-nocam.mdx", true, false],
    ]) {
        const model = new parsers.mdlx.Model();
        model.load(previewMdl(heroModel, withLight, withCameras));
        fs.writeFileSync(path.join(uiFolder, name), Buffer.from(model.saveMdx()));
    }
}

module.exports = { cameraCount, previewMdl, writePreviewModels };
