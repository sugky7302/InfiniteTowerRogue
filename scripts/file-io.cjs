const prepared = new WeakSet();

/** 預留檔案通道。同一次建置可重複呼叫，但不得覆蓋既有技能。 */
function createFileIoAbility(data) {
    if (prepared.has(data)) return;
    if (data.abilities.has("A0IO")) throw new Error("檔案通道技能代碼已被使用：A0IO");
    const ability = data.abilities.copy("ANcl", "A0IO");
    ability.levels = 1;
    prepared.add(data);
}
module.exports = { createFileIoAbility };
