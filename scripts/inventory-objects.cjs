/** 原生物品只作為載體，不提供屬性或使用效果。 */
function createInventoryObjects(data, config) {
    const codes = Object.values(config.nativeItemTypes);
    if (new Set(codes).size !== codes.length) throw new Error("原生物品代碼重複。");
    for (const code of codes) {
        for (const collection of [
            data.items,
            data.units,
            data.abilities,
            data.buffs,
            data.destructables,
            data.doodads,
            data.upgrades,
        ]) {
            if (collection && collection.has(code)) throw new Error(`物件代碼已被使用：${code}`);
        }
    }
    for (const [id, name] of Object.entries(config.nativeItemNames)) {
        const code = config.nativeItemTypes[id];
        if (!code) throw new Error(`物品基底沒有原生代碼：${id}`);
        const item = data.items.copy("ratf", code);
        Object.assign(item, {
            name: name,
            abilities: "",
            classification: "Permanent",
            interfaceIcon: config.nativeItemIcons[id],
            tooltipBasic: name,
            tooltipExtended: "物品資料由背包系統管理。",
            description: "可丟棄與撿起的物品載體。",
            canBeDropped: true,
            droppedWhenCarrierDies: false,
            canBeSoldToMerchants: false,
            canBeSoldByMerchants: false,
            activelyUsed: false,
            useAutomaticallyWhenAcquired: false,
            perishable: false,
            numberOfCharges: 0,
            includeAsRandomChoice: false,
            goldCost: 0,
            lumberCost: 0,
        });
    }
}
module.exports = { createInventoryObjects };
