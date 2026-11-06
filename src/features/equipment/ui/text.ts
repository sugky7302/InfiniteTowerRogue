import { combatNumber } from "@entities/combat";
import {
    AffixValueType,
    EquipSlot,
    getAffix,
    getItemBase,
    ItemBonusStat,
    ItemInstance,
    ItemTier,
} from "@entities/item";
import { EquipFailure, EquipFailureCode } from "../model/equipment";
import { EquipmentStats } from "../model/aggregate";

export const EQUIPMENT_SLOT_NAMES: Readonly<Record<EquipSlot, string>> = {
    "main-hand": "主武器",
    "off-hand": "副手",
    armor: "防具",
    tool: "工具",
};
export const EQUIPMENT_STAT_NAMES: Readonly<Record<keyof EquipmentStats, string>> = {
    maxLife: "最大生命",
    meleeAttack: "近戰攻擊力",
    rangedAttack: "遠程攻擊力",
    spellPower: "法術強度",
    physicalDefense: "物理防禦",
    spellDefense: "法術防禦",
    critChance: "基礎暴擊率",
    critDamage: "暴擊倍率",
    evasion: "迴避",
    attackSpeed: "攻擊速度",
    castingStability: "施法穩定",
    meleeCritChance: "近戰暴擊率",
    spellCritChance: "法術暴擊率",
};
export const EQUIPMENT_STAT_ORDER: readonly (keyof EquipmentStats)[] = [
    "maxLife",
    "meleeAttack",
    "rangedAttack",
    "spellPower",
    "physicalDefense",
    "spellDefense",
    "critChance",
    "critDamage",
    "evasion",
    "attackSpeed",
    "castingStability",
    "meleeCritChance",
    "spellCritChance",
];
const PERCENT_STATS: readonly (keyof EquipmentStats)[] = [
    "critChance",
    "critDamage",
    "attackSpeed",
    "meleeCritChance",
    "spellCritChance",
];
/** 以整數的十分位組字串，避免 Lua 將整數顯示成 200.0。 */
export function inventoryNumberText(value: number): string {
    const absolute = Math.abs(combatNumber(value));
    let whole = Math.floor(absolute);
    // 只放大小數部分，避免接近 int32 上限的值乘以 10。
    let fraction = Math.floor((absolute - whole) * 10 + 0.5);
    if (fraction === 10) {
        whole++;
        fraction = 0;
    }
    const sign = value < 0 && (whole !== 0 || fraction !== 0) ? "-" : "";
    return sign + whole + (fraction === 0 ? "" : "." + fraction);
}
export function equipmentStatValue(key: keyof EquipmentStats, value: number): string {
    return PERCENT_STATS.includes(key)
        ? inventoryNumberText(value * 100) + "%"
        : inventoryNumberText(value);
}
const BONUS_NAMES: Readonly<Record<ItemBonusStat, string>> = {
    maxLife: "最大生命加值",
    maxLifePercent: "最大生命",
    meleeAttack: "近戰攻擊力",
    spellPower: "法術強度",
    armor: "護甲防禦",
    protection: "裝備防護",
    evasion: "迴避",
    attackSpeed: "攻擊速度",
    meleeCritChance: "近戰暴擊率",
    spellCritChance: "法術暴擊率",
    physicalDamage: "物理傷害",
    fireDamage: "火焰傷害",
    frostDamage: "冰霜傷害",
    fireResistance: "火焰抗性",
    frostResistance: "冰霜抗性",
    directReduction: "直接承傷降低",
    armorPenetration: "固定護甲穿透",
    spellPenetration: "固定法術防禦穿透",
};
const PERCENT_BONUSES: readonly ItemBonusStat[] = [
    "maxLifePercent",
    "attackSpeed",
    "meleeCritChance",
    "spellCritChance",
    "physicalDamage",
    "fireDamage",
    "frostDamage",
    "fireResistance",
    "frostResistance",
    "directReduction",
];
export function equipmentBonusName(key: ItemBonusStat): string {
    return BONUS_NAMES[key];
}
export function equipmentBonusValue(key: ItemBonusStat, value: number): string {
    return inventoryNumberText(value) + (PERCENT_BONUSES.includes(key) ? "%" : "");
}
export function equipFailureText(failure: EquipFailure): string {
    switch (failure.code) {
        case EquipFailureCode.WrongSlot:
            return "穿戴位置錯誤。";
        case EquipFailureCode.OffHandOccupied:
            return "副手已占用，不能穿上雙手武器。";
        case EquipFailureCode.TwoHandedWeapon:
            return "雙手武器已占用副手。";
        case EquipFailureCode.MissingKnowledge:
            return `缺少知識：${failure.knowledge}。`;
        case EquipFailureCode.DuplicateInstance:
            return "同一物品已穿在其他位置。";
    }
}
export function inventoryItemText(item: ItemInstance): readonly string[] {
    const base = getItemBase(item.baseId);
    const tiers: Readonly<Record<ItemTier, string>> = {
        common: "普通",
        fine: "精良",
        masterwork: "名品",
        legendary: "傳世",
    };
    const fixed = base.bonuses.map(
        (bonus) => BONUS_NAMES[bonus.stat] + " +" + equipmentBonusValue(bonus.stat, bonus.value),
    );
    if (base.weapon !== undefined)
        fixed.push(
            `${base.weapon.hands === 2 ? "雙手" : "單手"}，傷害 ${base.weapon.base}＋近戰攻擊力×${base.weapon.coefficient}`,
        );
    const affixes = item.affixes.map((entry) => {
        const definition = getAffix(entry.affixId);
        const unit =
            definition.valueType === AffixValueType.Fixed
                ? ""
                : definition.valueType === AffixValueType.Percent
                  ? "%"
                  : " 個百分點";
        return definition.name + " +" + entry.value + unit;
    });
    return [
        `${base.name}，${tiers[item.tier]}階，${EQUIPMENT_SLOT_NAMES[base.slot]}，編號 ${item.id}`,
        "固定屬性：" + (fixed.length > 0 ? fixed.join("、") : "無"),
        "詞綴：" + (affixes.length > 0 ? affixes.join("、") : "無"),
    ];
}
