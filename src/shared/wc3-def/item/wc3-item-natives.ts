import { ItemNatives } from "./item-natives";

/** 載入模組不呼叫原生函式。所有 handle 建立與清理須在共同流程執行。 */
export const wc3ItemNatives: ItemNatives = {
    itemText(target, field, text) {
        switch (field) {
            case "name":
                BlzSetItemName(target, text);
                break;
            case "tip":
                BlzSetItemTooltip(target, text);
                break;
            case "ubertip":
                BlzSetItemExtendedTooltip(target, text);
                break;
            case "description":
                BlzSetItemDescription(target, text);
                break;
        }
    },
    itemType: (target) => GetItemTypeId(target),
    visitItems(callback) {
        // 此列舉只在共同初始化執行，語言切換不重新建立群組或區域。
        const bounds = GetWorldBounds()!;
        EnumItemsInRect(bounds, undefined, () => callback(GetEnumItem()!));
        const group = CreateGroup()!;
        GroupEnumUnitsInRect(group, bounds, undefined);
        let target = FirstOfGroup(group);
        while (target !== undefined) {
            GroupRemoveUnit(group, target);
            for (let slot = 0; slot < 6; slot++) {
                const held = UnitItemInSlot(target, slot);
                if (held !== undefined) callback(held);
            }
            target = FirstOfGroup(group);
        }
        DestroyGroup(group);
        RemoveRect(bounds);
    },
};
