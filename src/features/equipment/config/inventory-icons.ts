import { EquipSlot } from "@entities/item";

export const emptyBagIcon = "UI\\Widgets\\EscMenu\\Human\\blank-background.blp";
export const emptyEquipmentIcons: Readonly<Record<EquipSlot, string>> = {
    "main-hand": "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNSteelMelee.blp",
    "off-hand": "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNTome.blp",
    armor: "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNRobeOfTheMagi.blp",
    tool: "ReplaceableTextures\\CommandButtonsDisabled\\DISBTNHammer.blp",
};
