const prepared = new WeakSet();
// 必須與 src/shared/file-io/codec.ts 的 fileSegmentAbilities 相同。
const fileSegmentAbilities = ["A0IO"];
for (let index = 1; index < 43; index++)
    fileSegmentAbilities.push(index < 10 ? `AF0${index}` : `AF${index}`);

/** 預留檔案通道。同一次建置可重複呼叫，但不得覆蓋既有技能。 */
function createFileIoAbility(data) {
    if (prepared.has(data)) return;
    // 每段資料使用一個技能的第 0 級。
    for (const code of fileSegmentAbilities) {
        if (data.abilities.has(code)) throw new Error(`檔案通道技能代碼已被使用：${code}`);
        const ability = data.abilities.copy("ANcl", code);
        ability.levels = 1;
    }
    prepared.add(data);
}
module.exports = { createFileIoAbility, fileSegmentAbilities };
