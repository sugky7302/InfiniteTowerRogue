export type ItemTextField = "name" | "tip" | "ubertip" | "description";

export interface ItemNatives {
    /** 文字只供顯示。遊戲邏輯不得讀取或比較翻譯後的文字。 */
    itemText(target: item, field: ItemTextField, text: string): void;
    itemType(target: item): number;
    /** 共同流程列舉地上與背包內的現有物品。 */
    visitItems(callback: (this: void, target: item) => void): void;
}
