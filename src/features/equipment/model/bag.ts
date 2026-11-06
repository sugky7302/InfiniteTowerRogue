import { ItemInstance } from "@entities/item";

export const BAG_SIZE = 90;
/** false 明確表示空格。Lua 的 nil 無法維持陣列位置與長度。 */
export type BagSlot = ItemInstance | false;
export type BagState = readonly BagSlot[];
export function createBag(source: readonly (ItemInstance | false | undefined)[] = []): BagState {
    const bag: BagSlot[] = [];
    for (let slot = 0; slot < BAG_SIZE; slot++) bag.push(source[slot] ?? false);
    return bag;
}
export function firstEmptySlot(bag: BagState): number | undefined {
    for (let slot = 0; slot < BAG_SIZE; slot++) if (bag[slot] === false) return slot;
    return undefined;
}
export function findBagSlot(bag: BagState, id: number): number | undefined {
    for (let slot = 0; slot < BAG_SIZE; slot++) {
        const item = bag[slot];
        if (item !== false && item.id === id) return slot;
    }
    return undefined;
}
function validSlot(slot: number): boolean {
    return Number.isInteger(slot) && slot >= 0 && slot < BAG_SIZE;
}
export function putInBag(bag: BagState, item: ItemInstance): BagState | undefined {
    if (findBagSlot(bag, item.id) !== undefined) return undefined;
    const slot = firstEmptySlot(bag);
    if (slot === undefined) return undefined;
    const next = [...bag];
    next[slot] = item;
    return next;
}
export function takeFromBag(
    bag: BagState,
    slot: number,
): { readonly bag: BagState; readonly item: ItemInstance } | undefined {
    if (!validSlot(slot)) return undefined;
    const item = bag[slot];
    if (item === false) return undefined;
    const next = [...bag];
    next[slot] = false;
    return { bag: next, item };
}
export function swapBagSlots(bag: BagState, first: number, second: number): BagState | undefined {
    if (!validSlot(first) || !validSlot(second)) return undefined;
    const next = [...bag];
    next[first] = bag[second];
    next[second] = bag[first];
    return next;
}
