import { ClassId, HeroState, levelUp, runeScholar, getClassDefinition } from "@entities/character";
import { displayNumber } from "@entities/combat";
import { CombatRegistry } from "@features/combat";
import {
    aggregateEquipment,
    compareEquipment,
    emptyEquipment,
    equip,
    unequip,
    EquipmentState,
    EquipmentSummary,
    EquipFailure,
    EquipFailureCode,
} from "@features/equipment";
import {
    createItem,
    EquipSlot,
    getItemBase,
    getAffix,
    ItemBaseId,
    ItemInstance,
    ItemBonusStat,
    RandomInt,
    AffixValueType,
} from "@entities/item";
import type { HeroSnapshot } from "./hero-save";

function copyItem(item: ItemInstance, id = item.id): ItemInstance {
    return { ...item, id, affixes: item.affixes.map((entry) => ({ ...entry })) };
}

const slotOrder: readonly EquipSlot[] = [
    EquipSlot.MainHand,
    EquipSlot.OffHand,
    EquipSlot.Armor,
    EquipSlot.Tool,
];
const slots: Record<EquipSlot, string> = {
    [EquipSlot.MainHand]: "主武器",
    [EquipSlot.OffHand]: "副手",
    [EquipSlot.Armor]: "防具",
    [EquipSlot.Tool]: "工具",
};
const bases: Record<string, ItemBaseId> = {
    符文杖: ItemBaseId.RuneStaff,
    訓練短劍: ItemBaseId.TrainingSword,
    巡檢長槌: ItemBaseId.PatrolHammer,
    術式手冊: ItemBaseId.SpellManual,
    學徒長袍: ItemBaseId.ApprenticeRobe,
};
const statNames: Record<keyof EquipmentSummary["stats"], string> = {
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
const bonusNames: Record<ItemBonusStat, string> = {
    maxLife: "最大生命加值",
    maxLifePercent: "最大生命百分比",
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
function failureText(failure: EquipFailure): string {
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
function itemText(item: ItemInstance): string {
    const base = getItemBase(item.baseId);
    const fixed = base.bonuses.map((bonus) => `${bonusNames[bonus.stat]} +${bonus.value}`);
    if (base.weapon)
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
        return `${definition.name} +${entry.value}${unit}`;
    });
    // Lua 的空字串為真值，`|| "無"` 不會生效，所以檢查長度。
    const fixedText = fixed.length > 0 ? fixed.join("、") : "無";
    const affixText = affixes.length > 0 ? affixes.join("、") : "無";
    return `編號 ${item.id}，${base.name}，普通階；固定屬性：${fixedText}；詞綴：${affixText}`;
}

/** app 組合英雄、裝備與戰鬥。持有清單只供範例使用。 */
export class HeroExample {
    private currentHero: HeroState;
    private worn: EquipmentState = emptyEquipment();
    private held: ItemInstance[] = [];
    private nextId = 1;
    public summary: EquipmentSummary;
    public constructor(
        private readonly registry: CombatRegistry,
        private readonly unit: unit,
        private readonly random: RandomInt,
        private readonly changed: (this: void, summary: EquipmentSummary) => void,
        hero: HeroState = runeScholar,
    ) {
        this.currentHero = hero;
        for (const baseId of [ItemBaseId.RuneStaff, ItemBaseId.ApprenticeRobe]) {
            const item = this.create(baseId);
            const result = equip(hero, this.worn, item);
            if (!result.ok) throw new Error("起始裝備無法穿戴。");
            this.worn = result.state;
        }
        this.summary = aggregateEquipment(hero, this.worn);
        this.refresh();
    }
    public get hero(): HeroState {
        return this.currentHero;
    }
    public get equipment(): EquipmentState {
        return this.worn;
    }
    public get items(): readonly ItemInstance[] {
        return this.held;
    }
    public snapshot(): HeroSnapshot {
        const worn = { ...emptyEquipment() };
        for (const slot of Object.values(EquipSlot)) {
            const item = this.worn[slot];
            if (item !== undefined) worn[slot] = copyItem(item);
        }
        return {
            hero: {
                attributes: { ...this.currentHero.attributes },
                classes: this.currentHero.classes.map((entry) => ({ ...entry })),
                knowledge: [...this.currentHero.knowledge],
            },
            worn,
            held: this.held.map((item) => copyItem(item)),
        };
    }
    public restore(hero: HeroState, worn: EquipmentState, held: readonly ItemInstance[]): void {
        this.currentHero = {
            attributes: { ...hero.attributes },
            classes: hero.classes.map((entry) => ({ ...entry })),
            knowledge: [...hero.knowledge],
        };
        const restored = { ...emptyEquipment() };
        this.nextId = 1;
        // Lua 的物件列舉順序不固定。編號依固定位置順序指定。
        for (const slot of slotOrder) {
            const item = worn[slot];
            if (item !== undefined) restored[slot] = copyItem(item, this.nextId++);
        }
        this.worn = restored;
        this.held = held.map((item) => copyItem(item, this.nextId++));
        this.refresh();
    }
    private create(baseId: string): ItemInstance {
        if (this.nextId >= 2147483520) throw new Error("物品編號已達上限。");
        return createItem(this.nextId++, baseId, this.random);
    }
    private refresh(): void {
        this.summary = aggregateEquipment(this.currentHero, this.worn);
        const previous = this.registry.require(this.unit).profile;
        this.registry.update(
            this.unit,
            {
                ...this.summary.attributes,
                challenge: previous.challenge,
                armor: previous.armor,
                weapon: this.summary.mainWeapon,
            },
            this.summary.stats,
            this.summary.damageModifiers,
        );
        this.changed(this.summary);
    }
    public command(message: string): readonly string[] | undefined {
        const parts = message
            .trim()
            .split(" ")
            .filter((part) => part.length > 0);
        const command = parts[0];
        if (
            ![
                "-hero",
                "-hero-up",
                "-hero-forget",
                "-item-new",
                "-items",
                "-equip",
                "-unequip",
            ].includes(command)
        )
            return undefined;
        if (command === "-hero") {
            const a = this.currentHero.attributes;
            return [
                `力量 ${a.strength}，精準 ${a.precision}，身法 ${a.agility}，體質 ${a.constitution}，精神 ${a.spirit}，智力 ${a.intelligence}，幸運 ${a.luck}，親和 ${a.affinity}`,
                this.currentHero.classes
                    .map(
                        (entry) =>
                            `${getClassDefinition(entry.classId)?.name ?? entry.classId} ${entry.level} 級`,
                    )
                    .join("、"),
                `戰鬥等級 ${this.summary.attributes.level}`,
                ...Object.entries(statNames).map(
                    ([key, name]) =>
                        `${name} ${displayNumber(this.summary.stats[key as keyof EquipmentSummary["stats"]])}`,
                ),
                this.summary.mainWeapon
                    ? `主武器傷害 ${displayNumber(this.summary.mainWeaponDamage)}`
                    : "沒有武器",
            ];
        }
        if (command === "-hero-up") {
            const result = levelUp(this.currentHero, ClassId.RuneApprentice);
            if (!result.ok) return ["升級失敗：符文學徒已達最高等級，或尚未認證。"];
            this.currentHero = result.hero;
            this.refresh();
            return [
                `升級完成。戰鬥等級 ${this.summary.attributes.level}，最大生命 ${displayNumber(this.summary.stats.maxLife)}，法術強度 ${displayNumber(this.summary.stats.spellPower)}`,
            ];
        }
        if (command === "-hero-forget") {
            // 除錯用。清空知識，以驗證缺少知識時無法穿上物品。
            this.currentHero = { ...this.currentHero, knowledge: [] };
            return ["已清空英雄的知識。"];
        }
        if (command === "-items") {
            return [
                "穿戴物：",
                ...Object.values(EquipSlot).map(
                    (slot) =>
                        `${slots[slot]}：${this.worn[slot] ? itemText(this.worn[slot]!) : "空"}`,
                ),
                `持有清單 ${this.held.length}／12：`,
                ...this.held.map((item) => itemText(item)),
            ];
        }
        if (command === "-item-new") {
            const baseId =
                bases[parts[1]] ?? Object.values(ItemBaseId).find((id) => id === parts[1]);
            if (!baseId || parts.length !== 2)
                return [
                    "請指定基底：符文杖、訓練短劍、巡檢長槌、術式手冊、學徒長袍；也可使用基底 ID。",
                ];
            if (this.held.length >= 12) return ["持有清單已滿，最多 12 件。"];
            const item = this.create(baseId);
            this.held.push(item);
            return [itemText(item)];
        }
        if (command === "-unequip") {
            const slot = Object.values(EquipSlot).find(
                (value) => value === parts[1] || slots[value] === parts[1],
            );
            if (!slot || parts.length !== 2)
                return ["請指定位置：主武器、副手、防具、工具；也可使用位置 ID。"];
            if (!this.worn[slot]) return ["此位置沒有裝備。"];
            if (this.held.length >= 12) return ["持有清單已滿，無法卸下。"];
            const result = unequip(this.worn, slot);
            this.worn = result.state;
            this.held.push(result.removed!);
            this.refresh();
            return [`已卸下${slots[slot]}。`, ...(this.summary.mainWeapon ? [] : ["沒有武器"])];
        }
        const id = Number(parts[1]);
        const index = this.held.findIndex((item) => item.id === id);
        if (parts.length !== 2 || !Number.isInteger(id) || id < 1 || id > 2147483520 || index < 0)
            return ["請指定持有清單中的物品編號。"];
        const candidate = this.held[index];
        const comparison = compareEquipment(this.currentHero, this.worn, candidate);
        if (!comparison.ok) return comparison.failures.map((failure) => failureText(failure));
        const result = equip(this.currentHero, this.worn, candidate);
        if (!result.ok) return result.failures.map((failure) => failureText(failure));
        this.worn = result.state;
        this.held.splice(index, 1);
        if (result.removed) this.held.push(result.removed);
        this.refresh();
        const changes: string[] = [];
        for (const key of Object.keys(comparison.delta) as (keyof typeof comparison.delta)[]) {
            const value = comparison.delta[key];
            if (value !== 0)
                changes.push(`${statNames[key]} ${value > 0 ? "+" : ""}${displayNumber(value)}`);
        }
        for (const modifier of [
            ...comparison.modifierChanges.attacker,
            ...comparison.modifierChanges.target,
        ]) {
            const key = modifier.id.slice("equipment-".length) as ItemBonusStat;
            changes.push(
                `${bonusNames[key]}修正 ${modifier.value > 0 ? "+" : ""}${displayNumber(modifier.value)}`,
            );
        }
        changes.push(
            `主武器傷害差 ${displayNumber(comparison.mainWeaponDamageDelta)}，生命百分比差 ${displayNumber(comparison.maxLifePercentDelta)}`,
        );
        return [
            `已穿上 ${getItemBase(candidate.baseId).name}；原裝備：${comparison.current ? getItemBase(comparison.current.baseId).name : "空"}。`,
            ...changes,
        ];
    }
}
