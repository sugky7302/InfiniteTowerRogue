import { ClassId, HeroState, getClassDefinition, levelUp, runeScholar } from "@entities/character";
import {
    affixes,
    EquipSlot,
    getItemBonuses,
    ItemBaseId,
    ItemInstance,
    ItemTier,
    tierAffixCounts,
} from "@entities/item";
import { emptyEquipment, equip, EquipmentState } from "@features/equipment";
import { SaveData, SaveParticipant, SaveSection, SaveValue } from "@features/save";

/** 已發布的索引只能在尾端增加。預建英雄的索引 0 代表符文學者。 */
export const heroPresets: readonly HeroState[] = [runeScholar];
export const heroClasses: readonly string[] = ["", ClassId.RuneApprentice];
export const heroKnowledge: readonly string[] = [...runeScholar.knowledge];
export const heroBases: readonly string[] = [
    "",
    ItemBaseId.RuneStaff,
    ItemBaseId.TrainingSword,
    ItemBaseId.PatrolHammer,
    ItemBaseId.SpellManual,
    ItemBaseId.ApprenticeRobe,
];
export const heroTiers: readonly ItemTier[] = [
    ItemTier.Common,
    ItemTier.Fine,
    ItemTier.Masterwork,
    ItemTier.Legendary,
];
export const heroAffixes: readonly string[] = ["", ...affixes.map((entry) => entry.id)];
export const heroSlots: readonly EquipSlot[] = [
    EquipSlot.MainHand,
    EquipSlot.OffHand,
    EquipSlot.Armor,
    EquipSlot.Tool,
];
export const heroSection: SaveSection = {
    name: "hero",
    fields: [
        { name: "present", kind: "boolean" },
        { name: "preset", kind: "uint", min: 0, max: 15 },
        { name: "classIds", kind: "list", min: 0, max: 15, length: 4 },
        { name: "classLevels", kind: "list", min: 0, max: 63, length: 4 },
        { name: "knowledge", kind: "list", min: 0, max: 1, length: 32 },
    ],
};
export const equipmentSection: SaveSection = {
    name: "equipment",
    fields: [
        { name: "bases", kind: "list", min: 0, max: 63, length: 16 },
        { name: "tiers", kind: "list", min: 0, max: 3, length: 16 },
        { name: "affixIds", kind: "list", min: 0, max: 31, length: 64 },
        { name: "affixValues", kind: "list", min: 0, max: 63, length: 64 },
    ],
};
type Values = Record<string, SaveValue>;
function zeros(length: number): number[] {
    const values: number[] = [];
    for (let index = 0; index < length; index++) values.push(0);
    return values;
}
export function emptyHeroValues(): Values {
    return {
        present: false,
        preset: 0,
        classIds: zeros(4),
        classLevels: zeros(4),
        knowledge: zeros(32),
    };
}
export function emptyEquipmentValues(): Values {
    return { bases: zeros(16), tiers: zeros(16), affixIds: zeros(64), affixValues: zeros(64) };
}
export interface HeroSnapshot {
    readonly hero: HeroState;
    readonly worn: EquipmentState;
    readonly held: readonly ItemInstance[];
}
export type DecodedHero =
    { readonly present: false } | { readonly present: true; readonly hero: HeroState };
export type DecodedHeroSave =
    { readonly present: false } | ({ readonly present: true } & HeroSnapshot);

function validValues(section: SaveSection, values: Values): boolean {
    for (const field of section.fields) {
        const value = values[field.name];
        if (field.kind === "boolean") {
            if (typeof value !== "boolean") return false;
        } else {
            const list = field.kind === "list" ? value : [value];
            if (!Array.isArray(list) || list.length !== (field.kind === "list" ? field.length : 1))
                return false;
            for (const entry of list) {
                if (
                    typeof entry !== "number" ||
                    !Number.isInteger(entry) ||
                    entry < field.min ||
                    entry > field.max
                )
                    return false;
            }
        }
    }
    return true;
}

/** 純函式。從預建英雄重算成長，保存的知識取代預建知識。 */
export function decodeHeroSection(values: Values): DecodedHero | undefined {
    if (!validValues(heroSection, values)) return undefined;
    const preset = heroPresets[values.preset as number];
    if (preset === undefined) return undefined;
    const ids = values.classIds as number[],
        levels = values.classLevels as number[];
    const flags = values.knowledge as number[];
    for (let index = heroKnowledge.length; index < flags.length; index++) {
        if (flags[index] !== 0) return undefined;
    }
    if (values.present === false) {
        if (values.preset !== 0 || [...ids, ...levels, ...flags].some((value) => value !== 0))
            return undefined;
        return { present: false };
    }
    let hero = preset;
    const seen: string[] = [];
    const classes: HeroState["classes"][number][] = [];
    for (let index = 0; index < ids.length; index++) {
        const id = heroClasses[ids[index]];
        const level = levels[index];
        if (id === undefined) return undefined;
        if (ids[index] === 0) {
            if (level !== 0) return undefined;
            continue;
        }
        const certified = preset.classes.find((entry) => entry.classId === id);
        const definition = getClassDefinition(id);
        if (
            seen.includes(id) ||
            certified === undefined ||
            definition === undefined ||
            level < certified.level ||
            level > definition.tier * 5
        )
            return undefined;
        seen.push(id);
        for (let current = certified.level; current < level; current++) {
            const result = levelUp(hero, id);
            if (!result.ok) return undefined;
            hero = result.hero;
        }
        classes.push({ classId: id, level });
    }
    if (preset.classes.some((entry) => !seen.includes(entry.classId))) return undefined;
    return {
        present: true,
        hero: {
            ...hero,
            classes,
            knowledge: heroKnowledge.filter((_, index) => flags[index] === 1),
        },
    };
}

/** 純函式。先驗證全部物品，再依保存的位置穿戴。 */
export function decodeEquipmentSection(
    values: Values,
    decoded: DecodedHero,
): DecodedHeroSave | undefined {
    if (!validValues(equipmentSection, values)) return undefined;
    const bases = values.bases as number[],
        tiers = values.tiers as number[];
    const ids = values.affixIds as number[],
        amounts = values.affixValues as number[];
    if (!decoded.present) {
        if ([...bases, ...tiers, ...ids, ...amounts].some((value) => value !== 0)) return undefined;
        return { present: false };
    }
    let worn = emptyEquipment();
    const held: ItemInstance[] = [];
    let nextId = 1;
    for (let position = 0; position < 16; position++) {
        const base = bases[position],
            tier = heroTiers[tiers[position]];
        if (heroBases[base] === undefined || tier === undefined) return undefined;
        const entries: ItemInstance["affixes"][number][] = [];
        let ended = false;
        for (let index = 0; index < 4; index++) {
            const offset = position * 4 + index;
            const id = ids[offset],
                value = amounts[offset];
            if (heroAffixes[id] === undefined) return undefined;
            if (id === 0) {
                ended = true;
                if (value !== 0) return undefined;
            } else {
                if (ended || base === 0) return undefined;
                entries.push({ affixId: heroAffixes[id], value });
            }
        }
        if (base === 0) {
            if (tiers[position] !== 0) return undefined;
            continue;
        }
        if (entries.length !== tierAffixCounts[tier]) return undefined;
        const item: ItemInstance = {
            id: nextId++,
            baseId: heroBases[base],
            tier,
            affixes: entries,
        };
        try {
            getItemBonuses(item);
        } catch {
            // 規則函式以例外回報無效物品。解碼統一拒絕，不輸出物品內容。
            return undefined;
        }
        if (position < 4) {
            const result = equip(decoded.hero, worn, item, heroSlots[position]);
            if (!result.ok) return undefined;
            worn = result.state;
        } else held.push(item);
    }
    return { present: true, hero: decoded.hero, worn, held };
}

export function decodeHeroSave(data: SaveData): DecodedHeroSave | undefined {
    if (data.hero === undefined || data.equipment === undefined) return undefined;
    const decoded = decodeHeroSection(data.hero);
    return decoded === undefined ? undefined : decodeEquipmentSection(data.equipment, decoded);
}

/** 純函式。不保存計算結果、物品編號或 WC3 狀態。 */
export function encodeHeroSave(snapshot?: HeroSnapshot): SaveData | undefined {
    const hero = emptyHeroValues(),
        equipment = emptyEquipmentValues();
    if (snapshot === undefined) return { hero, equipment };
    const source = snapshot.hero;
    if (source.classes.length > 4 || snapshot.held.length > 12) return undefined;
    hero.present = true;
    for (let index = 0; index < source.classes.length; index++) {
        const entry = source.classes[index];
        const id = heroClasses.indexOf(entry.classId);
        if (id <= 0) return undefined;
        (hero.classIds as number[])[index] = id;
        (hero.classLevels as number[])[index] = entry.level;
    }
    for (const entry of source.knowledge) {
        const index = heroKnowledge.indexOf(entry);
        if (index < 0) return undefined;
        (hero.knowledge as number[])[index] = 1;
    }
    // Lua 陣列尾端的 nil 不計入長度。明確依位置讀取，避免持有物移入空的工具格。
    for (let position = 0; position < 16; position++) {
        const item =
            position < 4 ? snapshot.worn[heroSlots[position]] : snapshot.held[position - 4];
        if (item === undefined) continue;
        const base = heroBases.indexOf(item.baseId),
            tier = heroTiers.indexOf(item.tier);
        if (base <= 0 || tier < 0 || item.affixes.length > 4) return undefined;
        (equipment.bases as number[])[position] = base;
        (equipment.tiers as number[])[position] = tier;
        for (let index = 0; index < item.affixes.length; index++) {
            const entry = item.affixes[index];
            const id = heroAffixes.indexOf(entry.affixId);
            if (id <= 0) return undefined;
            (equipment.affixIds as number[])[position * 4 + index] = id;
            (equipment.affixValues as number[])[position * 4 + index] = entry.value;
        }
    }
    const data = { hero, equipment };
    return decodeHeroSave(data) === undefined ? undefined : data;
}

export interface HeroSaveTarget {
    snapshot(): HeroSnapshot;
    restore(hero: HeroState, worn: EquipmentState, held: readonly ItemInstance[]): void;
}

/** 必須依傳回順序登錄。暫存只保存已驗證的純資料，不修改目標。 */
export function createHeroSaveParticipants(
    owner: player,
    target?: HeroSaveTarget,
): readonly SaveParticipant[] {
    let staged: DecodedHero | undefined;
    let stagedPlayer: player | undefined;
    const collect = (player: player): SaveData | undefined =>
        encodeHeroSave(player === owner ? target?.snapshot() : undefined);
    return [
        {
            section: heroSection,
            empty: emptyHeroValues(),
            collect: (player) => collect(player)?.hero,
            prepare(player, values) {
                stagedPlayer = player;
                staged = decodeHeroSection(values);
                if (
                    staged === undefined ||
                    (staged.present && (player !== owner || target === undefined))
                )
                    return undefined;
                return () => {};
            },
        },
        {
            section: equipmentSection,
            empty: emptyEquipmentValues(),
            collect: (player) => collect(player)?.equipment,
            prepare(player, values) {
                const hero = staged;
                staged = undefined;
                if (hero === undefined || stagedPlayer !== player) return undefined;
                const decoded = decodeEquipmentSection(values, hero);
                if (decoded === undefined) return undefined;
                return () => {
                    if (decoded.present) target!.restore(decoded.hero, decoded.worn, decoded.held);
                };
            },
        },
    ];
}
