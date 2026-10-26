/** 預留檔案通道，禁止覆蓋原始地圖或其他建置模組的技能。 */
function createFileIoAbility(data) {
    if (data.abilities.has("A0IO")) throw new Error("檔案通道技能代碼已被使用：A0IO");
    const ability = data.abilities.copy("ANcl", "A0IO");
    ability.levels = 1;
}
module.exports = { createFileIoAbility };
