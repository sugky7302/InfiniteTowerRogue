import { getItemBase, ItemBonusStat } from "@entities/item";
import { NATIVE_ITEM_ICONS } from "../config/native-items";
import { EMPTY_BAG_ICON, EMPTY_EQUIPMENT_ICONS } from "../config/inventory-icons";
import { aggregateEquipment } from "../model/aggregate";
import { compareEquipment } from "../model/compare";
import {
    InventoryCell,
    InventorySelection,
    InventorySnapshot,
    inventoryCellItem,
} from "./interaction";
import { bagPosition, INVENTORY_SLOTS } from "./layout";
import {
    EQUIPMENT_SLOT_NAMES,
    EQUIPMENT_STAT_NAMES,
    EQUIPMENT_STAT_ORDER,
    equipmentStatValue,
    equipFailureText,
    inventoryItemText,
    equipmentBonusName,
    inventoryNumberText,
} from "./text";

export function inventorySlotView(
    snapshot: InventorySnapshot,
    cell: InventoryCell,
    selection: InventorySelection,
) {
    const item = inventoryCellItem(snapshot, cell);
    const selected = selection !== false && item !== false && selection.itemId === item.id;
    return {
        cell,
        selected,
        name: item === false ? "空" : getItemBase(item.baseId).name,
        icon:
            item === false
                ? cell.kind === "bag"
                    ? EMPTY_BAG_ICON
                    : EMPTY_EQUIPMENT_ICONS[cell.slot]
                : NATIVE_ITEM_ICONS[item.baseId],
    };
}
export function inventoryDescription(
    snapshot: InventorySnapshot,
    cell: InventoryCell | false,
): string {
    if (cell === false) return "移入格子以查看物品；點選一格，再點另一格。";
    const item = inventoryCellItem(snapshot, cell);
    if (item === false)
        return cell.kind === "bag" ? "空背包格子。" : EQUIPMENT_SLOT_NAMES[cell.slot] + "：空。";
    const lines = [...inventoryItemText(item)];
    if (cell.kind === "bag") {
        const comparison = compareEquipment(snapshot.hero, snapshot.worn, item);
        if (!comparison.ok)
            lines.push(
                "不能穿上：" +
                    comparison.failures.map((failure) => equipFailureText(failure)).join(" "),
            );
        else {
            lines.push(
                "比較：" +
                    (comparison.current === undefined
                        ? "空"
                        : getItemBase(comparison.current.baseId).name),
            );
            const changes: string[] = [];
            for (const key of EQUIPMENT_STAT_ORDER) {
                const value = comparison.delta[key];
                if (value !== 0)
                    changes.push(
                        EQUIPMENT_STAT_NAMES[key] +
                            " " +
                            (value > 0 ? "+" : "") +
                            equipmentStatValue(key, value),
                    );
            }
            if (comparison.mainWeaponDamageDelta !== 0)
                changes.push("主武器傷害 " + inventoryNumberText(comparison.mainWeaponDamageDelta));
            if (comparison.maxLifePercentDelta !== 0)
                changes.push(
                    "生命百分比 " + inventoryNumberText(comparison.maxLifePercentDelta * 100) + "%",
                );
            for (const modifier of [
                ...comparison.modifierChanges.attacker,
                ...comparison.modifierChanges.target,
            ]) {
                const key = modifier.id.slice("equipment-".length) as ItemBonusStat;
                const flat = key === "armorPenetration" || key === "spellPenetration";
                changes.push(
                    equipmentBonusName(key) +
                        " " +
                        (modifier.value > 0 ? "+" : "") +
                        inventoryNumberText(modifier.value * (flat ? 1 : 100)) +
                        (flat ? "" : "%"),
                );
            }
            lines.push("差值：" + (changes.length > 0 ? changes.join("、") : "無"));
        }
    }
    return lines.join("\n");
}
export function inventoryView(
    snapshot: InventorySnapshot,
    page: number,
    selection: InventorySelection,
) {
    if (!Number.isInteger(page) || page < 0 || page >= 3) throw new Error("背包頁數必須為 0～2。");
    const bag = [];
    for (let index = page * 30; index < (page + 1) * 30; index++)
        bag.push({
            ...inventorySlotView(snapshot, { kind: "bag", index }, selection),
            ...bagPosition(index),
        });
    const summary = aggregateEquipment(snapshot.hero, snapshot.worn);
    return {
        bag,
        worn: INVENTORY_SLOTS.map((slot) =>
            inventorySlotView(snapshot, { kind: "equipment", slot }, selection),
        ),
        stats: EQUIPMENT_STAT_ORDER.map((key) => ({
            name: EQUIPMENT_STAT_NAMES[key],
            value: equipmentStatValue(key, summary.stats[key]),
        })),
    };
}
