import { strict as assert } from "node:assert";
import { AffixId, getItemBase, ItemBaseId, ItemInstance, ItemTier } from "@entities/item";
import { emptyEquipment, EquipmentState } from "@features/equipment";

export function item(
    id: number,
    baseId: ItemBaseId,
    affixId?: AffixId,
    value?: number,
    tier: ItemTier = ItemTier.Common,
): ItemInstance {
    return { id, baseId, tier, affixes: affixId ? [{ affixId, value: value! }] : [] };
}
export function wearing(...items: ItemInstance[]): EquipmentState {
    const state = { ...emptyEquipment() };
    for (const value of items) state[getItemBase(value.baseId).slot] = value;
    return state;
}
export function float32(value: number): number {
    assert.ok(Number.isFinite(value) && Math.abs(value) <= 2147483647);
    const rounded = Math.fround(value);
    assert.ok(Number.isFinite(rounded) && Math.abs(rounded) <= 2147483647);
    return rounded;
}
