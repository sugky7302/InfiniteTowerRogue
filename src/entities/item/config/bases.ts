import { AffixId } from "./affixes";
import { AffixPoolEntry, EquipSlot, ItemBase, ItemBonusStat, ItemTag } from "../model/item";

export const ItemBaseId = {
    RuneStaff: "rune-staff",
    TrainingSword: "training-sword",
    PatrolHammer: "patrol-hammer",
    SpellManual: "spell-manual",
    ApprenticeRobe: "apprentice-robe",
} as const;
export type ItemBaseId = (typeof ItemBaseId)[keyof typeof ItemBaseId];
function pool(...ids: AffixId[]): readonly AffixPoolEntry[] {
    return ids.map((affixId) => ({ affixId, weight: 1 }));
}
export const ITEM_BASES: readonly ItemBase[] = [
    {
        id: ItemBaseId.RuneStaff,
        name: "符文杖",
        slot: EquipSlot.MainHand,
        tags: [ItemTag.Weapon, ItemTag.MeleeWeapon, ItemTag.CastingFocus],
        weapon: { name: "符文杖", hands: 1, base: 4, coefficient: 0.5 },
        bonuses: [],
        requiredKnowledge: [],
        affixPool: pool(
            AffixId.SpellPower,
            AffixId.MeleeAttack,
            AffixId.FireDamage,
            AffixId.FrostDamage,
            AffixId.SpellCritChance,
            AffixId.AttackSpeed,
        ),
    },
    {
        id: ItemBaseId.TrainingSword,
        name: "訓練短劍",
        slot: EquipSlot.MainHand,
        tags: [ItemTag.Weapon, ItemTag.MeleeWeapon],
        weapon: { name: "訓練短劍", hands: 1, base: 4, coefficient: 0.5 },
        bonuses: [],
        requiredKnowledge: [],
        affixPool: pool(
            AffixId.MeleeAttack,
            AffixId.PhysicalDamage,
            AffixId.MeleeCritChance,
            AffixId.AttackSpeed,
            AffixId.ArmorPenetration,
        ),
    },
    {
        id: ItemBaseId.PatrolHammer,
        name: "巡檢長槌",
        slot: EquipSlot.MainHand,
        tags: [ItemTag.Weapon, ItemTag.MeleeWeapon],
        weapon: { name: "巡檢長槌", hands: 2, base: 6, coefficient: 0.75 },
        bonuses: [],
        requiredKnowledge: [],
        affixPool: pool(
            AffixId.MeleeAttack,
            AffixId.PhysicalDamage,
            AffixId.MeleeCritChance,
            AffixId.ArmorPenetration,
        ),
    },
    {
        id: ItemBaseId.SpellManual,
        name: "術式手冊",
        slot: EquipSlot.OffHand,
        tags: [ItemTag.CastingFocus],
        bonuses: [],
        requiredKnowledge: ["魔法解析"],
        affixPool: pool(
            AffixId.SpellPower,
            AffixId.SpellPenetration,
            AffixId.FireDamage,
            AffixId.FrostDamage,
        ),
    },
    {
        id: ItemBaseId.ApprenticeRobe,
        name: "學徒長袍",
        slot: EquipSlot.Armor,
        tags: [ItemTag.Armor, ItemTag.LightArmor],
        bonuses: [{ stat: ItemBonusStat.Protection, value: 4 }],
        requiredKnowledge: [],
        affixPool: pool(
            AffixId.MaxLife,
            AffixId.MaxLifePercent,
            AffixId.Evasion,
            AffixId.Protection,
            AffixId.FireResistance,
            AffixId.FrostResistance,
            AffixId.DirectReduction,
        ),
    },
];
export function getItemBase(id: string): ItemBase {
    const result = ITEM_BASES.find((entry) => entry.id === id);
    if (!result) throw new Error("物品基底識別碼未登錄。");
    return result;
}
