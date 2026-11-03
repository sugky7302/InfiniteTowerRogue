import {
    AbilityNatives,
    ItemNatives,
    PlayerNatives,
    UnitNatives,
    wc3AbilityNatives,
    wc3ItemNatives,
    wc3PlayerNatives,
    wc3UnitNatives,
} from "@shared/wc3-def";

/** i18n 需要的原生操作。文字設定只供顯示。 */
export type I18nNatives = Pick<PlayerNatives, "getLocale"> &
    Pick<AbilityNatives, "abilityText"> &
    ItemNatives &
    Pick<UnitNatives, "unitName" | "heroName" | "unitType" | "isHero" | "watchUnits">;

/** 載入模組不呼叫原生函式。所有 handle 建立與清理須在共同流程執行。 */
export const wc3I18nNatives: I18nNatives = {
    getLocale: wc3PlayerNatives.getLocale,
    abilityText: wc3AbilityNatives.abilityText,
    itemText: wc3ItemNatives.itemText,
    itemType: wc3ItemNatives.itemType,
    visitItems: wc3ItemNatives.visitItems,
    unitName: wc3UnitNatives.unitName,
    heroName: wc3UnitNatives.heroName,
    unitType: wc3UnitNatives.unitType,
    isHero: wc3UnitNatives.isHero,
    watchUnits: wc3UnitNatives.watchUnits,
};
