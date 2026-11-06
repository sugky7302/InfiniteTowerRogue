import { EquipSlot } from "@entities/item";

export const EMPTY_BAG_ICON = "UI\\Widgets\\EscMenu\\Human\\blank-background.blp";
export const EMPTY_EQUIPMENT_ICONS: Readonly<Record<EquipSlot, string>> = {
    "main-hand": "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNSteelMelee.blp",
    "off-hand": "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNTome.blp",
    armor: "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNRobeOfTheMagi.blp",
    tool: "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNHammer.blp",
};
