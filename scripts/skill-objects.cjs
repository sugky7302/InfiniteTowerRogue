function createSkillObjects(data, definitions) {
    const { SKILLS: skills, castSeconds, rangeYards, yardsToWc3, scholar } = definitions;
    for (const skill of skills) {
        if (data.abilities.has(skill.code)) throw new Error(`技能代碼已被使用：${skill.code}`);
        const ability = data.abilities.copy("ANcl", skill.code);
        Object.assign(ability, {
            name: skill.name,
            heroAbility: false,
            itemAbility: false,
            levels: 1,
            castingTime: 0,
            followThroughTime: 60,
            // 套件宣告是字串，但 WC3 的這些欄位必須儲存為整數。
            targetType: skill.target === "point" ? 2 : 1,
            options: 1,
            disableOtherAbilities: false,
            baseOrderIDundefined: skill.target === "point" ? "flamestrike" : "frostnova",
            manaCost: skill.mana,
            cooldown: skill.cooldown,
            castRange: yardsToWc3(rangeYards(skill)),
            targetsAllowed:
                skill.target === "point"
                    ? "ground,air,friend,enemy,self,neutral"
                    : "ground,air,enemy",
            tooltipNormal: skill.name,
            tooltipNormalExtended: `${skill.name}：施法 ${castSeconds(skill)} 秒，法力 ${skill.mana}，冷卻 ${skill.cooldown} 秒。`,
            hotkeyNormal: skill.target === "point" ? "F" : "I",
            buttonPositionNormalX: skill.target === "point" ? 0 : 1,
            buttonPositionNormalY: 2,
            iconNormal:
                skill.target === "point"
                    ? "ReplaceableTextures\\CommandButtons\\BTNFireBolt.blp"
                    : "ReplaceableTextures\\CommandButtons\\BTNFrostBolt.blp",
            caster: "",
            target: "",
            effect: "",
            areaEffect: "",
            special: "",
        });
    }
    for (const code of ["H0SS", "h0SE"])
        if (data.units.has(code)) throw new Error(`單位代碼已被使用：${code}`);
    const hero = data.units.copy("Hamg", "H0SS");
    const capacity = 10 + scholar.spirit * 3 + scholar.intelligence * 2;
    Object.assign(hero, {
        name: "符文學者",
        properNames: "符文學者",
        properNamesUsed: 1,
        hero: "",
        // AInv：英雄物品欄。3.0 的內建背包與裝備欄需要它（I3 實驗）。
        normal: [...skills.map((skill) => skill.code), "AInv"].join(","),
        startingIntelligence: scholar.intelligence,
        intelligencePerLevel: 0,
        agilityPerLevel: 0,
        strengthPerLevel: 0,
        animationCastPoint: 0,
        animationCastBackswing: 0,
        manaMaximum: capacity,
        manaInitialAmount: capacity,
        manaRegeneration: 0,
        hitPointsMaximumBase: 1000,
    });
    const enemy = data.units.copy("hfoo", "h0SE");
    Object.assign(enemy, {
        name: "測試敵人",
        normal: "",
        hero: "",
        hitPointsMaximumBase: 2000,
        hitPointsRegenerationRate: 0,
        attacksEnabled: 0,
        defenseBase: 20,
        speedBase: 270,
        speedMinimum: 0,
    });
    // 套件不保存技能等級與資料指標。只修正這次新增的單級技能。
    const save = data.save.bind(data);
    const codes = new Set(skills.map((skill) => skill.code));
    const leveled = new Set([
        "acas",
        "adur",
        "ahdu",
        "acdn",
        "amcs",
        "aare",
        "aran",
        "atar",
        "atp1",
        "aub1",
    ]);
    data.save = () => {
        const output = save();
        for (const key of ["w3a", "w3aSkin"]) {
            for (const object of output[key]?.customTable.objects || []) {
                if (!codes.has(object.newId)) continue;
                // 套件省略等於內建預設值的 false。明確輸出，避免繼承引擎的 Channel 設定。
                if (key === "w3a" && !object.modifications.some((mod) => mod.id === "Ncl5")) {
                    const Modification =
                        require("mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3u/modification").default;
                    const disabled = new Modification();
                    Object.assign(disabled, { id: "Ncl5", variableType: 0, value: 0 });
                    object.modifications.push(disabled);
                }
                for (const mod of object.modifications) {
                    if (leveled.has(mod.id) || /^Ncl[1-6]$/.test(mod.id)) mod.levelOrVariation = 1;
                    if (/^Ncl[1-6]$/.test(mod.id)) mod.dataPointer = Number(mod.id[3]);
                }
            }
        }
        return output;
    };
}
module.exports = { createSkillObjects };
