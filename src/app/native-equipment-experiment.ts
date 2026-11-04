import { logger } from "@shared/logger";

// 實驗用（I3）：確認 3.0 內建裝備欄與背包能否用在本地圖的英雄。結果確認後移除。
// 專案型別使用 war3-types-strict 1.33.0。以下宣告取自 3.0.0 的 common.j。
declare interface loadoutslot extends handle {
    __loadoutslot: never;
}
declare const EQUIPMENT_LOADOUT_SLOT_BOOTS: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_CHEST: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_GLOVES: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_HEAD: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_OFFHAND: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_PRIMARY: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_RING: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_RINGALT: loadoutslot;
declare const EQUIPMENT_LOADOUT_SLOT_TRINKET: loadoutslot;
declare const ITEM_TYPE_EQUIPMENT: itemtype;
declare const EVENT_UNIT_EQUIP_ITEM: unitevent;
declare const EVENT_UNIT_UNEQUIP_ITEM: unitevent;
declare function GetEquippedItem(): item | undefined;
declare function GetUnequippedItem(): item | undefined;
declare function UnitExtendedInventorySize(whichUnit: unit): number;
declare function UnitHasAnyItemEquiped(whichUnit: unit): boolean;
declare function UnitItemInBagSlot(whichUnit: unit, itemSlot: number): item | undefined;
declare function UnitItemInEquipmentSlot(whichUnit: unit, itemSlot: loadoutslot): item | undefined;
declare function UnitEquipItem(whichUnit: unit, whichItem: item): boolean;
const created: item[] = [];
const sampleItems = ["ebtf", "ecgb", "eclg", "ecgh", "ecss", "ttal"];
const slots: [string, loadoutslot][] = [
    ["頭", EQUIPMENT_LOADOUT_SLOT_HEAD],
    ["胸", EQUIPMENT_LOADOUT_SLOT_CHEST],
    ["手套", EQUIPMENT_LOADOUT_SLOT_GLOVES],
    ["靴子", EQUIPMENT_LOADOUT_SLOT_BOOTS],
    ["主手", EQUIPMENT_LOADOUT_SLOT_PRIMARY],
    ["副手", EQUIPMENT_LOADOUT_SLOT_OFFHAND],
    ["戒指", EQUIPMENT_LOADOUT_SLOT_RING],
    ["戒指 2", EQUIPMENT_LOADOUT_SLOT_RINGALT],
    ["飾品", EQUIPMENT_LOADOUT_SLOT_TRINKET],
];

function itemName(target: item | undefined): string {
    return target === undefined ? "空" : `${GetItemName(target) ?? "?"}`;
}

/** 在共同流程登錄穿脫事件，輸出事件是否觸發。 */
export function installNativeEquipmentEvents(hero: unit): void {
    const trigger = CreateTrigger();
    TriggerRegisterUnitEvent(trigger, hero, EVENT_UNIT_EQUIP_ITEM);
    TriggerRegisterUnitEvent(trigger, hero, EVENT_UNIT_UNEQUIP_ITEM);
    // 撿不起物品時，確認是否收到命令與撿起事件。
    TriggerRegisterUnitEvent(trigger, hero, EVENT_UNIT_PICKUP_ITEM);
    TriggerRegisterUnitEvent(trigger, hero, EVENT_UNIT_ISSUED_TARGET_ORDER);
    TriggerAddAction(trigger, () => {
        if (GetTriggerEventId() === EVENT_UNIT_PICKUP_ITEM) {
            logger.info(`撿起事件：${itemName(GetManipulatedItem())}`);
            return;
        }
        if (GetTriggerEventId() === EVENT_UNIT_ISSUED_TARGET_ORDER) {
            const target = GetOrderTargetItem();
            if (target !== undefined)
                logger.info(
                    `對物品下命令：${OrderId2String(GetIssuedOrderId()) ?? GetIssuedOrderId()}，${itemName(target)}`,
                );
            return;
        }
        const equipped = GetEquippedItem();
        const unequipped = GetUnequippedItem();
        logger.info(`內建裝備事件：穿上 ${itemName(equipped)}，卸下 ${itemName(unequipped)}`);
    });
}

export function nativeEquipmentCommand(hero: unit, message: string): readonly string[] | undefined {
    if (message === "-ne-info") {
        const lines = [
            `物品欄 ${UnitInventorySize(hero)}，延伸物品欄 ${UnitExtendedInventorySize(hero)}，有穿戴 ${UnitHasAnyItemEquiped(hero)}`,
            slots
                .map(([name, slot]) => `${name}：${itemName(UnitItemInEquipmentSlot(hero, slot))}`)
                .join("，"),
        ];
        const bag: string[] = [];
        const size = UnitExtendedInventorySize(hero);
        for (let index = 0; index < size && index < 100; index++) {
            const target = UnitItemInBagSlot(hero, index);
            if (target !== undefined) bag.push(`${index}:${itemName(target)}`);
        }
        lines.push(`背包：${bag.length > 0 ? bag.join("，") : "空"}`);
        return lines;
    }
    if (message === "-ne-inv") {
        // 英雄沒有物品欄技能時無法撿起物品。測試內建英雄物品欄 AInv 是否帶有背包。
        const added = UnitAddAbility(hero, FourCC("AInv"));
        return [
            `加入 AInv：${added}。物品欄 ${UnitInventorySize(hero)}，延伸物品欄 ${UnitExtendedInventorySize(hero)}`,
        ];
    }
    if (message === "-ne-give") {
        const lines: string[] = [];
        for (const code of sampleItems) {
            const item = CreateItem(FourCC(code), GetUnitX(hero) + 80, GetUnitY(hero));
            if (item !== undefined) created.push(item);
            lines.push(
                item === undefined
                    ? `${code}：無法建立`
                    : `${code}：${itemName(item)}，裝備類型 ${GetItemType(item) === ITEM_TYPE_EQUIPMENT}`,
            );
        }
        return lines;
    }
    if (message === "-ne-probe") {
        // 參考地圖的英雄是 3.0 內建單位。列出它們的技能，找出開啟背包的技能代碼。
        const lines: string[] = [];
        for (const code of ["Hctl", "Hctr", "Hpal", "Hamg"]) {
            const probe = CreateUnit(
                GetOwningPlayer(hero),
                FourCC(code),
                GetUnitX(hero) - 200,
                GetUnitY(hero),
                0,
            );
            if (probe === undefined) {
                lines.push(`${code}：無法建立`);
                continue;
            }
            const ids: string[] = [];
            for (let index = 0; index < 40; index++) {
                const ability = BlzGetUnitAbilityByIndex(probe, index);
                if (ability === undefined) break;
                const id = BlzGetAbilityId(ability);
                ids.push(
                    `${string.char((id >>> 24) & 255, (id >>> 16) & 255, (id >>> 8) & 255, id & 255)}`,
                );
            }
            lines.push(
                `${code} ${GetUnitName(probe) ?? ""}：物品欄 ${UnitInventorySize(probe)}，延伸 ${UnitExtendedInventorySize(probe)}，技能 ${ids.join(",")}`,
            );
            RemoveUnit(probe);
        }
        return lines;
    }
    if (message === "-ne-add") {
        // 不經過撿起命令，直接把 -ne-give 建立的物品交給英雄。
        const lines = created.map(
            (target) => `${itemName(target)}：UnitAddItem ${UnitAddItem(hero, target)}`,
        );
        lines.push(
            `物品欄 ${UnitInventorySize(hero)}，延伸物品欄 ${UnitExtendedInventorySize(hero)}`,
        );
        return lines.length > 1 ? lines : ["沒有物品。先 -ne-give。"];
    }
    if (message === "-ne-equip") {
        const lines: string[] = [];
        const size = UnitExtendedInventorySize(hero);
        for (let index = 0; index < size && index < 100; index++) {
            const target = UnitItemInBagSlot(hero, index);
            if (target !== undefined)
                lines.push(
                    `背包 ${index} ${itemName(target)}：穿上 ${UnitEquipItem(hero, target)}`,
                );
        }
        for (let index = 0; index < UnitInventorySize(hero); index++) {
            const target = UnitItemInSlot(hero, index);
            if (target !== undefined)
                lines.push(
                    `物品欄 ${index} ${itemName(target)}：穿上 ${UnitEquipItem(hero, target)}`,
                );
        }
        return lines.length > 0 ? lines : ["沒有可穿的物品。先 -ne-give，再撿起物品。"];
    }
    return undefined;
}
