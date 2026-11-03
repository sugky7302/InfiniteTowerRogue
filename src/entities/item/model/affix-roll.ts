import {
    affixTables,
    AffixDefinition,
    getAffix,
    getAffixRange,
    tierAffixCounts,
} from "../config/affixes";
import { getItemBase } from "../config/bases";
import { ItemBase, ItemBonus, ItemInstance, ItemTier, RandomInt } from "./item";

export function isAffixCompatible(base: ItemBase, affix: AffixDefinition): boolean {
    return affix.compatibleTags.some((tag) => base.tags.includes(tag));
}
function draw(random: RandomInt, minimum: number, maximum: number): number {
    const value = random(minimum, maximum);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error("亂數必須是指定閉區間內的整數。");
    }
    return value;
}
/** 本版只產生普通階。權重與整數數值各使用一次同步亂數。 */
export function createItem(id: number, baseId: string, random: RandomInt): ItemInstance {
    if (!Number.isInteger(id) || id < 0 || id > 2147483520) {
        throw new Error("物品實例識別碼必須是 32 位元非負整數。");
    }
    const base = getItemBase(baseId);
    const candidates = base.affixPool.filter((entry) =>
        isAffixCompatible(base, getAffix(entry.affixId)),
    );
    const seen: string[] = [];
    let totalWeight = 0;
    for (const entry of candidates) {
        if (
            seen.includes(entry.affixId) ||
            !Number.isInteger(entry.weight) ||
            entry.weight <= 0 ||
            entry.weight > 2147483520 - totalWeight
        ) {
            throw new Error("詞綴池的識別碼或權重無效。");
        }
        seen.push(entry.affixId);
        totalWeight += entry.weight;
    }
    const count = tierAffixCounts[ItemTier.Common];
    if (candidates.length < count) throw new Error("相容詞綴數量不足。");
    const result: ItemInstance["affixes"][number][] = [];
    for (let index = 0; index < count; index++) {
        let roll = draw(random, 1, totalWeight);
        let selected = 0;
        while (roll > candidates[selected].weight) {
            roll -= candidates[selected].weight;
            selected++;
        }
        const entry = candidates[selected];
        const [minimum, maximum] = getAffixRange(entry.affixId, ItemTier.Common);
        result.push({ affixId: entry.affixId, value: draw(random, minimum, maximum) });
        totalWeight -= entry.weight;
        candidates.splice(selected, 1);
    }
    return { id, baseId, tier: ItemTier.Common, affixes: result };
}
/** 驗證已保存的四階物品，並輸出中性屬性加成。 */
export function getItemBonuses(item: ItemInstance): readonly ItemBonus[] {
    const base = getItemBase(item.baseId);
    const seen: string[] = [];
    const bonuses = [...base.bonuses];
    for (const rolled of item.affixes) {
        const definition = getAffix(rolled.affixId);
        const [minimum, maximum] = affixTables[definition.table][item.tier];
        if (
            seen.includes(rolled.affixId) ||
            !isAffixCompatible(base, definition) ||
            !base.affixPool.some((entry) => entry.affixId === rolled.affixId) ||
            !Number.isInteger(rolled.value) ||
            rolled.value < minimum ||
            rolled.value > maximum
        ) {
            throw new Error("物品詞綴重複、不相容或超出階級區間。");
        }
        seen.push(rolled.affixId);
        bonuses.push({ stat: definition.stat, value: rolled.value });
    }
    return bonuses;
}
export function affixPercentile(affixId: string, tier: ItemTier, value: number): number {
    const [minimum, maximum] = getAffixRange(affixId, tier);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error("詞綴數值超出階級區間。");
    }
    return maximum === minimum ? 100 : ((value - minimum) / (maximum - minimum)) * 100;
}
