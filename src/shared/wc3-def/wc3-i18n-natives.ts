import { I18nNatives } from "./i18n-natives";

/** 載入模組不呼叫原生函式。所有 handle 建立與清理須在共同流程執行。 */
export const wc3I18nNatives: I18nNatives = {
    getLocale: () => BlzGetLocale() ?? "",
    abilityText(id, field, level, text) {
        switch (field) {
            case "tip":
                BlzSetAbilityTooltip(id, text, level);
                break;
            case "ubertip":
                BlzSetAbilityExtendedTooltip(id, text, level);
                break;
            case "untip":
                BlzSetAbilityActivatedTooltip(id, text, level);
                break;
            case "unubertip":
                BlzSetAbilityActivatedExtendedTooltip(id, text, level);
                break;
            case "researchtip":
                BlzSetAbilityResearchTooltip(id, text, level);
                break;
            case "researchubertip":
                BlzSetAbilityResearchExtendedTooltip(id, text, level);
                break;
        }
    },
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
    unitName: (target, text) => BlzSetUnitName(target, text),
    heroName: (target, text) => BlzSetHeroProperName(target, text),
    unitType: (target) => GetUnitTypeId(target),
    itemType: (target) => GetItemTypeId(target),
    isHero: (target) => IsUnitType(target, UNIT_TYPE_HERO),
    watchUnits(callback) {
        // 全部用戶端使用相同順序建立 handle。回呼只登記與設定文字。
        const bounds = GetWorldBounds()!;
        const area = CreateRegion();
        RegionAddRect(area, bounds);
        const entered = CreateTrigger();
        TriggerRegisterEnterRegion(entered, area, undefined);
        TriggerAddAction(entered, () => callback(GetEnteringUnit()!));
        const group = CreateGroup()!;
        GroupEnumUnitsInRect(group, bounds, undefined);
        let target = FirstOfGroup(group);
        while (target !== undefined) {
            GroupRemoveUnit(group, target);
            callback(target);
            target = FirstOfGroup(group);
        }
        DestroyGroup(group);
        return () => {
            DestroyTrigger(entered);
            RemoveRegion(area);
            RemoveRect(bounds);
        };
    },
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
