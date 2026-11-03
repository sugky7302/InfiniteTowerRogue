import { ItemBonusStat, ItemTag, ItemTier } from "../model/item";

export const AffixValueType = {
    Fixed: "fixed",
    Percent: "percent",
    PercentagePoint: "percentage-point",
} as const;
export type AffixValueType = (typeof AffixValueType)[keyof typeof AffixValueType];

export const AffixTable = {
    Minor: "minor",
    Standard: "standard",
    Strong: "strong",
    MaxLife: "max-life",
    MeleeAttack: "melee-attack",
    RangedAttack: "ranged-attack",
    SpellPower: "spell-power",
    Evasion: "evasion",
    Armor: "armor",
    Protection: "protection",
    ArmorPenetration: "armor-penetration",
    SpellPenetration: "spell-penetration",
} as const;
export type AffixTable = (typeof AffixTable)[keyof typeof AffixTable];
export type AffixRange = readonly [number, number];
export type TierRanges = Readonly<Record<ItemTier, AffixRange>>;

function ranges(
    common: AffixRange,
    fine: AffixRange,
    masterwork: AffixRange,
    legendary: AffixRange,
): TierRanges {
    return {
        [ItemTier.Common]: common,
        [ItemTier.Fine]: fine,
        [ItemTier.Masterwork]: masterwork,
        [ItemTier.Legendary]: legendary,
    };
}
const attackRanges = ranges([2, 4], [4, 7], [6, 10], [9, 14]);
const defenseRanges = ranges([4, 8], [7, 13], [11, 19], [17, 28]);
/** 來源為 docs/dnd/規則/詞綴.md 的全部四階共用數值表。 */
export const affixTables: Readonly<Record<AffixTable, TierRanges>> = {
    [AffixTable.Minor]: ranges([1, 2], [2, 4], [3, 6], [5, 8]),
    [AffixTable.Standard]: ranges([2, 5], [4, 8], [7, 12], [10, 15]),
    [AffixTable.Strong]: ranges([4, 8], [7, 12], [14, 20], [18, 25]),
    [AffixTable.MaxLife]: ranges([8, 15], [14, 24], [22, 36], [32, 50]),
    [AffixTable.MeleeAttack]: attackRanges,
    [AffixTable.RangedAttack]: attackRanges,
    [AffixTable.SpellPower]: attackRanges,
    [AffixTable.Evasion]: ranges([1, 1], [1, 2], [2, 3], [3, 4]),
    [AffixTable.Armor]: defenseRanges,
    [AffixTable.Protection]: defenseRanges,
    [AffixTable.ArmorPenetration]: attackRanges,
    [AffixTable.SpellPenetration]: attackRanges,
};
export const tierAffixCounts: Readonly<Record<ItemTier, number>> = {
    [ItemTier.Common]: 1,
    [ItemTier.Fine]: 2,
    [ItemTier.Masterwork]: 3,
    [ItemTier.Legendary]: 4,
};
export const AffixId = {
    PhysicalDamage: "physical-damage",
    FireDamage: "fire-damage",
    FrostDamage: "frost-damage",
    MeleeCritChance: "melee-crit-chance",
    SpellCritChance: "spell-crit-chance",
    AttackSpeed: "attack-speed",
    FireResistance: "fire-resistance",
    FrostResistance: "frost-resistance",
    DirectReduction: "direct-reduction",
    MaxLifePercent: "max-life-percent",
    MaxLife: "max-life",
    MeleeAttack: "melee-attack",
    SpellPower: "spell-power",
    Evasion: "evasion",
    Armor: "armor",
    Protection: "protection",
    ArmorPenetration: "armor-penetration",
    SpellPenetration: "spell-penetration",
} as const;
export type AffixId = (typeof AffixId)[keyof typeof AffixId];
export interface AffixDefinition {
    readonly id: AffixId;
    readonly name: string;
    readonly valueType: AffixValueType;
    readonly table: AffixTable;
    readonly stat: ItemBonusStat;
    readonly compatibleTags: readonly ItemTag[];
    readonly stackingGroup: string;
}
const offense = [ItemTag.Weapon, ItemTag.CastingFocus, ItemTag.Accessory];
const survival = [ItemTag.Armor, ItemTag.Shield, ItemTag.Accessory];
function affix(
    id: AffixId,
    name: string,
    valueType: AffixValueType,
    table: AffixTable,
    stat: ItemBonusStat,
    compatibleTags: readonly ItemTag[],
    stackingGroup: string = stat,
): AffixDefinition {
    return { id, name, valueType, table, stat, compatibleTags, stackingGroup };
}
export const affixes: readonly AffixDefinition[] = [
    affix(
        AffixId.PhysicalDamage,
        "物理傷害",
        AffixValueType.Percent,
        AffixTable.Standard,
        ItemBonusStat.PhysicalDamage,
        offense,
        "damage-increase",
    ),
    affix(
        AffixId.FireDamage,
        "火焰傷害",
        AffixValueType.Percent,
        AffixTable.Standard,
        ItemBonusStat.FireDamage,
        offense,
        "damage-increase",
    ),
    affix(
        AffixId.FrostDamage,
        "冰霜傷害",
        AffixValueType.Percent,
        AffixTable.Standard,
        ItemBonusStat.FrostDamage,
        offense,
        "damage-increase",
    ),
    affix(
        AffixId.MeleeCritChance,
        "暴擊率（近戰）",
        AffixValueType.PercentagePoint,
        AffixTable.Standard,
        ItemBonusStat.MeleeCritChance,
        [ItemTag.MeleeWeapon, ItemTag.Accessory],
    ),
    affix(
        AffixId.SpellCritChance,
        "暴擊率（法術）",
        AffixValueType.PercentagePoint,
        AffixTable.Standard,
        ItemBonusStat.SpellCritChance,
        [ItemTag.CastingFocus, ItemTag.Accessory],
    ),
    affix(
        AffixId.AttackSpeed,
        "攻擊速度",
        AffixValueType.Percent,
        AffixTable.Standard,
        ItemBonusStat.AttackSpeed,
        [ItemTag.Weapon, ItemTag.Accessory],
    ),
    affix(
        AffixId.FireResistance,
        "火焰抗性",
        AffixValueType.PercentagePoint,
        AffixTable.Standard,
        ItemBonusStat.FireResistance,
        survival,
    ),
    affix(
        AffixId.FrostResistance,
        "冰霜抗性",
        AffixValueType.PercentagePoint,
        AffixTable.Standard,
        ItemBonusStat.FrostResistance,
        survival,
    ),
    affix(
        AffixId.DirectReduction,
        "受到直接傷害降低",
        AffixValueType.Percent,
        AffixTable.Minor,
        ItemBonusStat.DirectReduction,
        survival,
    ),
    affix(
        AffixId.MaxLifePercent,
        "最大生命（百分比）",
        AffixValueType.Percent,
        AffixTable.Standard,
        ItemBonusStat.MaxLifePercent,
        [ItemTag.Armor, ItemTag.Accessory],
    ),
    affix(
        AffixId.MaxLife,
        "最大生命（固定）",
        AffixValueType.Fixed,
        AffixTable.MaxLife,
        ItemBonusStat.MaxLife,
        [ItemTag.Armor, ItemTag.Accessory],
    ),
    affix(
        AffixId.MeleeAttack,
        "近戰攻擊力（固定）",
        AffixValueType.Fixed,
        AffixTable.MeleeAttack,
        ItemBonusStat.MeleeAttack,
        [ItemTag.MeleeWeapon],
    ),
    affix(
        AffixId.SpellPower,
        "法術強度（固定）",
        AffixValueType.Fixed,
        AffixTable.SpellPower,
        ItemBonusStat.SpellPower,
        [ItemTag.CastingFocus, ItemTag.Accessory],
    ),
    affix(
        AffixId.Evasion,
        "迴避（固定）",
        AffixValueType.Fixed,
        AffixTable.Evasion,
        ItemBonusStat.Evasion,
        [ItemTag.Armor, ItemTag.Accessory],
    ),
    affix(
        AffixId.Armor,
        "護甲防禦（固定）",
        AffixValueType.Fixed,
        AffixTable.Armor,
        ItemBonusStat.Armor,
        [ItemTag.Armor, ItemTag.Shield],
    ),
    affix(
        AffixId.Protection,
        "裝備防護（固定）",
        AffixValueType.Fixed,
        AffixTable.Protection,
        ItemBonusStat.Protection,
        survival,
    ),
    affix(
        AffixId.ArmorPenetration,
        "固定護甲穿透",
        AffixValueType.Fixed,
        AffixTable.ArmorPenetration,
        ItemBonusStat.ArmorPenetration,
        [ItemTag.Weapon],
    ),
    affix(
        AffixId.SpellPenetration,
        "固定法術防禦穿透",
        AffixValueType.Fixed,
        AffixTable.SpellPenetration,
        ItemBonusStat.SpellPenetration,
        [ItemTag.CastingFocus, ItemTag.Accessory],
    ),
];
export function getAffix(id: string): AffixDefinition {
    const result = affixes.find((entry) => entry.id === id);
    if (!result) throw new Error("詞綴識別碼未登錄。");
    return result;
}
export function getAffixRange(id: string, tier: ItemTier): AffixRange {
    return affixTables[getAffix(id).table][tier];
}
