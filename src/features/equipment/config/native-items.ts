import type { ItemBaseId } from "@entities/item";

/** 已使用的代碼不得改指向其他基底。建置時檢查衝突。 */
export const NATIVE_ITEM_TYPES: Readonly<Record<ItemBaseId, string>> = {
    "rune-staff": "I0B1",
    "training-sword": "I0B2",
    "patrol-hammer": "I0B3",
    "spell-manual": "I0B4",
    "apprentice-robe": "I0B5",
};

export const NATIVE_ITEM_ICONS: Readonly<Record<string, string>> = {
    "rune-staff": "ReplaceableTextures\\CommandButtons\\BTNStaffOfSanctuary.blp",
    "training-sword": "ReplaceableTextures\\CommandButtons\\BTNSteelMelee.blp",
    "patrol-hammer": "ReplaceableTextures\\CommandButtons\\BTNHammer.blp",
    "spell-manual": "ReplaceableTextures\\CommandButtons\\BTNTome.blp",
    "apprentice-robe": "ReplaceableTextures\\CommandButtons\\BTNRobeOfTheMagi.blp",
};

export const NATIVE_ITEM_NAMES: Readonly<Record<ItemBaseId, string>> = {
    "rune-staff": "符文杖",
    "training-sword": "訓練短劍",
    "patrol-hammer": "巡檢長槌",
    "spell-manual": "術式手冊",
    "apprentice-robe": "學徒長袍",
};
