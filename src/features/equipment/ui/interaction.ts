import type { HeroState } from "@entities/character";
import { EquipSlot, ItemInstance } from "@entities/item";
import { BagState, firstEmptySlot, putInBag, swapBagSlots, takeFromBag } from "../model/bag";
import { EquipmentState, equip, unequip } from "../model/equipment";
import { equipFailureText } from "./text";

export interface InventorySnapshot {
    readonly hero: HeroState;
    readonly worn: EquipmentState;
    readonly bag: BagState;
}
export type InventoryCell =
    | { readonly kind: "bag"; readonly index: number }
    | { readonly kind: "equipment"; readonly slot: EquipSlot };
export type InventorySelection = false | { readonly cell: InventoryCell; readonly itemId: number };
export type InventoryEvent =
    { readonly kind: "click"; readonly cell: InventoryCell } | { readonly kind: "drop" };
export interface InventoryTransition {
    readonly worn: EquipmentState;
    readonly bag: BagState;
    readonly selection: InventorySelection;
    readonly messages: readonly string[];
    readonly changed: boolean;
    readonly dropped?: ItemInstance;
}
/** 由 app 實作。操作只接受同步事件，不接受本地框架查詢。 */
export interface InventoryPort {
    read(): InventorySnapshot;
    send(selection: InventorySelection, event: InventoryEvent): InventoryTransition;
    subscribe(listener: (this: void) => void): () => void;
}

export function inventoryCellItem(
    snapshot: InventorySnapshot,
    cell: InventoryCell,
): ItemInstance | false {
    if (cell.kind === "equipment") return snapshot.worn[cell.slot] ?? false;
    if (!Number.isInteger(cell.index) || cell.index < 0 || cell.index >= 90) return false;
    return snapshot.bag[cell.index] ?? false;
}
function sameCell(a: InventoryCell, b: InventoryCell): boolean {
    return a.kind === "bag"
        ? b.kind === "bag" && a.index === b.index
        : b.kind === "equipment" && a.slot === b.slot;
}
/** 純狀態機。載體丟棄成功後，app 才能提交結果。失敗不修改資料。 */
export function inventoryTransition(
    snapshot: InventorySnapshot,
    selection: InventorySelection,
    event: InventoryEvent,
): InventoryTransition {
    const unchanged = (
        messages: readonly string[] = [],
        next = selection,
    ): InventoryTransition => ({
        worn: snapshot.worn,
        bag: snapshot.bag,
        selection: next,
        messages,
        changed: false,
    });
    if (selection !== false) {
        const current = inventoryCellItem(snapshot, selection.cell);
        if (current === false || current.id !== selection.itemId)
            return unchanged(["選取的物品已變更，請重新選取。"], false);
    }
    if (event.kind === "drop") {
        if (selection === false) return unchanged(["請先選取背包物品。"]);
        if (selection.cell.kind !== "bag") return unchanged(["請先卸下裝備，再從背包丟棄。"]);
        const removed = takeFromBag(snapshot.bag, selection.cell.index)!;
        return {
            ...unchanged(["已丟棄物品。"], false),
            bag: removed.bag,
            dropped: removed.item,
            changed: true,
        };
    }
    const cell = event.cell;
    if (
        cell.kind === "bag" &&
        (!Number.isInteger(cell.index) || cell.index < 0 || cell.index >= 90)
    )
        return unchanged(["背包格子必須為 0～89。"]);
    const target = inventoryCellItem(snapshot, cell);
    if (selection === false)
        return unchanged([], target === false ? false : { cell, itemId: target.id });
    if (sameCell(selection.cell, cell)) return unchanged([], false);
    const source = selection.cell;
    if (source.kind === "bag" && cell.kind === "bag")
        return {
            ...unchanged(["已交換背包格子。"], false),
            bag: swapBagSlots(snapshot.bag, source.index, cell.index)!,
            changed: true,
        };
    if (source.kind === "bag" && cell.kind === "equipment") {
        const candidate = inventoryCellItem(snapshot, source) as ItemInstance;
        const result = equip(snapshot.hero, snapshot.worn, candidate, cell.slot);
        if (!result.ok)
            return unchanged(result.failures.map((failure) => equipFailureText(failure)));
        let bag = takeFromBag(snapshot.bag, source.index)!.bag;
        if (result.removed !== undefined) bag = putInBag(bag, result.removed)!;
        return { ...unchanged(["已穿上裝備。"], false), worn: result.state, bag, changed: true };
    }
    if (source.kind === "equipment" && cell.kind === "bag") {
        if (firstEmptySlot(snapshot.bag) === undefined) return unchanged(["背包已滿。"]);
        const result = unequip(snapshot.worn, source.slot);
        return {
            ...unchanged(["已卸下裝備。"], false),
            worn: result.state,
            bag: putInBag(snapshot.bag, result.removed!)!,
            changed: true,
        };
    }
    return unchanged(["請選取背包格子，以卸下裝備。"]);
}
