// C4 範例物件。明確儲存 C3 確認的近戰欄位。
const codes = ["H0SS", "h0CM"];
function createCombatObjects(data, definitions) {
    if (data.units.has("h0CM")) throw new Error("巡檢機代碼已被使用。");
    const hero = data.units.get("H0SS");
    if (!hero) throw new Error("請先建立技能範例物件。");
    const machine = data.units.copy("hfoo", "h0CM");
    // 原生力量與敏捷會產生額外生命、恢復與攻速。戰鬥屬性由登錄讀取。
    hero.startingStrength = 0;
    hero.startingAgility = 0;
    Object.assign(machine, {
        name: "舊令巡檢機",
        normal: "",
        hero: "",
        hitPointsMaximumBase: 62,
        defenseBase: 0,
        speedBase: 270,
        speedMinimum: 0,
        acquisitionRange: 0,
    });
    const seconds = definitions.scholar.attackSeconds;
    for (const [index, value] of [hero, machine].entries())
        Object.assign(value, {
            hitPointsRegenerationRate: 0,
            attacksEnabled: index === 0 ? 1 : 0,
            acquisitionRange: index === 0 ? 200 : 0,
            attack1DamageBase: 1,
            attack1DamageNumberOfDice: 1,
            attack1DamageSidesPerDie: 1,
            attack1WeaponType: "normal",
            attack1Range: 100,
            attack1RangeMotionBuffer: 250,
            attack1AnimationDamagePoint: 0.5,
            attack1AnimationBackswingPoint: 0.5,
            attack1CooldownTime: seconds,
            speedMinimum: 0,
        });
    const save = data.save.bind(data);
    data.save = () => {
        const output = save();
        const Modification =
            require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/modification").default;
        for (const object of output.w3u?.customTable.objects || []) {
            const index = codes.indexOf(object.newId);
            if (index < 0) continue;
            for (const [id, variableType, value] of [
                ["urb1", 2, 250],
                ["udp1", 2, 0.5],
                ["ua1c", 2, seconds],
                ["uaen", 0, index === 0 ? 1 : 0],
                ["ua1w", 3, "normal"],
                ["ua1r", 0, 100],
            ]) {
                let modification = object.modifications.find((entry) => entry.id === id);
                if (!modification) {
                    modification = new Modification();
                    object.modifications.push(modification);
                }
                Object.assign(modification, { id, variableType, value });
            }
        }
        return output;
    };
}
module.exports = { codes, createCombatObjects };
