import { ItemCarrierNatives } from "./item-carrier-natives";

export const wc3ItemCarrierNatives: ItemCarrierNatives = {
    createItem: (code, x, y) => CreateItem(FourCC(code), x, y),
    removeItem: (target) => RemoveItem(target),
    setVisible: (target, visible) => SetItemVisible(target, visible),
    setPosition: (target, x, y) => SetItemPosition(target, x, y),
    setUserData: (target, id) => SetItemUserData(target, id),
    getUserData: (target) => GetItemUserData(target),
    removeFromUnit: (owner, target) => UnitRemoveItem(owner, target),
    unitX: (target) => GetUnitX(target),
    unitY: (target) => GetUnitY(target),
    ensureInventory(target) {
        if (GetUnitAbilityLevel(target, FourCC("AInv")) === 0)
            UnitAddAbility(target, FourCC("AInv"));
    },
    onPickup(target, callback) {
        const trigger = CreateTrigger()!;
        TriggerRegisterUnitEvent(trigger, target, EVENT_UNIT_PICKUP_ITEM);
        TriggerAddAction(trigger, () => callback(GetManipulatedItem()!));
        return () => DestroyTrigger(trigger);
    },
};
