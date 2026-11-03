import { HeroState } from "@entities/character";
import { EquipSlot, getItemBase, ItemInstance } from "@entities/item";

export type EquipmentState = Readonly<Record<EquipSlot, ItemInstance | undefined>>;
export const EquipFailureCode = {
    WrongSlot: "wrong-slot",
    OffHandOccupied: "off-hand-occupied",
    TwoHandedWeapon: "two-handed-weapon",
    MissingKnowledge: "missing-knowledge",
    DuplicateInstance: "duplicate-instance",
} as const;
export type EquipFailureCode = (typeof EquipFailureCode)[keyof typeof EquipFailureCode];
export interface EquipFailure {
    readonly code: EquipFailureCode;
    readonly slot: EquipSlot;
    readonly knowledge?: string;
}
export type EquipResult =
    | { readonly ok: true; readonly state: EquipmentState; readonly removed?: ItemInstance }
    | {
          readonly ok: false;
          readonly state: EquipmentState;
          readonly failures: readonly EquipFailure[];
      };

export function emptyEquipment(): EquipmentState {
    return {
        [EquipSlot.MainHand]: undefined,
        [EquipSlot.OffHand]: undefined,
        [EquipSlot.Armor]: undefined,
        [EquipSlot.Tool]: undefined,
    };
}
export function checkEquip(
    hero: HeroState,
    state: EquipmentState,
    item: ItemInstance,
    slot: EquipSlot,
): readonly EquipFailure[] {
    const base = getItemBase(item.baseId);
    const failures: EquipFailure[] = [];
    if (base.slot !== slot) failures.push({ code: EquipFailureCode.WrongSlot, slot });
    if (slot === EquipSlot.MainHand && base.weapon?.hands === 2 && state[EquipSlot.OffHand]) {
        failures.push({ code: EquipFailureCode.OffHandOccupied, slot: EquipSlot.OffHand });
    }
    const main = state[EquipSlot.MainHand];
    if (slot === EquipSlot.OffHand && main && getItemBase(main.baseId).weapon?.hands === 2) {
        failures.push({ code: EquipFailureCode.TwoHandedWeapon, slot: EquipSlot.MainHand });
    }
    for (const knowledge of base.requiredKnowledge) {
        if (!hero.knowledge.includes(knowledge))
            failures.push({ code: EquipFailureCode.MissingKnowledge, slot, knowledge });
    }
    for (const other of Object.values(EquipSlot)) {
        if (other !== slot && state[other]?.id === item.id)
            failures.push({ code: EquipFailureCode.DuplicateInstance, slot: other });
    }
    return failures;
}
export function equip(
    hero: HeroState,
    state: EquipmentState,
    item: ItemInstance,
    slot: EquipSlot = getItemBase(item.baseId).slot,
): EquipResult {
    const failures = checkEquip(hero, state, item, slot);
    if (failures.length > 0) return { ok: false, state, failures };
    return { ok: true, state: { ...state, [slot]: item }, removed: state[slot] };
}
export function unequip(
    state: EquipmentState,
    slot: EquipSlot,
): { readonly state: EquipmentState; readonly removed?: ItemInstance } {
    const removed = state[slot];
    return { state: removed ? { ...state, [slot]: undefined } : state, removed };
}
