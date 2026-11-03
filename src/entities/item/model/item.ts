export const ItemTier = {
    Common: "common",
    Fine: "fine",
    Masterwork: "masterwork",
    Legendary: "legendary",
} as const;
export type ItemTier = (typeof ItemTier)[keyof typeof ItemTier];

export const EquipSlot = {
    MainHand: "main-hand",
    OffHand: "off-hand",
    Armor: "armor",
    Tool: "tool",
} as const;
export type EquipSlot = (typeof EquipSlot)[keyof typeof EquipSlot];

export const ItemTag = {
    Weapon: "weapon",
    MeleeWeapon: "melee-weapon",
    RangedWeapon: "ranged-weapon",
    CastingFocus: "casting-focus",
    Armor: "armor",
    LightArmor: "light-armor",
    Shield: "shield",
    Accessory: "accessory",
} as const;
export type ItemTag = (typeof ItemTag)[keyof typeof ItemTag];

export const ItemBonusStat = {
    MaxLife: "maxLife",
    MaxLifePercent: "maxLifePercent",
    MeleeAttack: "meleeAttack",
    SpellPower: "spellPower",
    Armor: "armor",
    Protection: "protection",
    Evasion: "evasion",
    AttackSpeed: "attackSpeed",
    MeleeCritChance: "meleeCritChance",
    SpellCritChance: "spellCritChance",
    PhysicalDamage: "physicalDamage",
    FireDamage: "fireDamage",
    FrostDamage: "frostDamage",
    FireResistance: "fireResistance",
    FrostResistance: "frostResistance",
    DirectReduction: "directReduction",
    ArmorPenetration: "armorPenetration",
    SpellPenetration: "spellPenetration",
} as const;
export type ItemBonusStat = (typeof ItemBonusStat)[keyof typeof ItemBonusStat];

/** 百分比與百分點保存整數。轉接層再除以 100。 */
export interface ItemBonus {
    readonly stat: ItemBonusStat;
    readonly value: number;
}
export interface ItemWeapon {
    readonly name: string;
    readonly hands: 1 | 2;
    readonly base: number;
    readonly coefficient: number;
}
export interface AffixPoolEntry {
    readonly affixId: string;
    readonly weight: number;
}
export interface ItemBase {
    readonly id: string;
    readonly name: string;
    readonly slot: EquipSlot;
    readonly tags: readonly ItemTag[];
    readonly weapon?: ItemWeapon;
    readonly bonuses: readonly ItemBonus[];
    readonly requiredKnowledge: readonly string[];
    readonly affixPool: readonly AffixPoolEntry[];
}
export interface ItemAffix {
    readonly affixId: string;
    readonly value: number;
}
export interface ItemInstance {
    readonly id: number;
    readonly baseId: string;
    readonly tier: ItemTier;
    readonly affixes: readonly ItemAffix[];
}
export type RandomInt = (this: void, minimum: number, maximum: number) => number;
