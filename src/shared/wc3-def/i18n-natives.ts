export type AbilityTextField =
    "tip" | "ubertip" | "untip" | "unubertip" | "researchtip" | "researchubertip";
export type ItemTextField = "name" | "tip" | "ubertip" | "description";

/** 文字設定只供顯示。遊戲邏輯不得讀取或比較翻譯後的 GetUnitName 等文字。 */
export interface I18nNatives {
    getLocale(): string;
    abilityText(id: number, field: AbilityTextField, level: number, text: string): void;
    itemText(target: item, field: ItemTextField, text: string): void;
    unitName(target: unit, text: string): void;
    heroName(target: unit, text: string): void;
    unitType(target: unit): number;
    itemType(target: item): number;
    isHero(target: unit): boolean;
    /** 共同流程建立列舉群組、區域與觸發器。回呼中的設定文字不得建立 handle。 */
    watchUnits(callback: (this: void, target: unit) => void): (this: void) => void;
    /** 共同流程列舉地上與背包內的現有物品。 */
    visitItems(callback: (this: void, target: item) => void): void;
}
