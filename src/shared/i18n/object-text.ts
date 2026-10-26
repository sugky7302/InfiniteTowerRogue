import { localEffect, untracked } from "../rxwc3/signal";
import { I18nNatives, AbilityTextField, ItemTextField } from "../wc3-def/i18n-natives";
import { Locale } from "./locale";
import { I18n } from "./translation";

export interface ObjectTextEntry {
    key: string;
    kind: "ability" | "unit" | "item";
    id: number;
    field: string;
    /** 物件資料從 1 起算。原生技能介面從 0 起算。 */
    level: number;
}
export interface ObjectTextData {
    entries: ObjectTextEntry[];
    tables: Record<Locale, Record<string, string>>;
}

/** 只設定顯示文字。本地 effect 不得建立 handle。單位說明與技能編輯器名稱僅保留資料。 */
export function createObjectText(service: I18n, data: ObjectTextData, natives: I18nNatives) {
    const units = new Set<unit>();
    const items = new Set<item>();
    const text = (entry: ObjectTextEntry): string =>
        data.tables[service.language()][entry.key] ?? data.tables["zh-TW"][entry.key];
    const applyUnit = (target: unit): void => {
        const id = natives.unitType(target);
        for (const entry of data.entries) {
            if (entry.kind !== "unit" || entry.id !== id) continue;
            if (entry.field === "name") natives.unitName(target, text(entry));
            // 專有名稱清單使用第一個名稱，避免讀取或比較已翻譯的原生名稱。
            if (entry.field === "properNames" && natives.isHero(target))
                natives.heroName(target, text(entry).split(",")[0]);
        }
    };
    const applyItem = (target: item): void => {
        const id = natives.itemType(target);
        if (id === 0) return;
        for (const entry of data.entries) {
            if (entry.kind === "item" && entry.id === id)
                natives.itemText(target, entry.field as ItemTextField, text(entry));
        }
    };
    const effect = localEffect(() => {
        service.language();
        for (const entry of data.entries) {
            if (entry.kind === "ability" && entry.field !== "name") {
                natives.abilityText(
                    entry.id,
                    entry.field as AbilityTextField,
                    entry.level - 1,
                    text(entry),
                );
            }
        }
        for (const target of units) applyUnit(target);
        for (const target of items) applyItem(target);
    });
    return {
        /** 在共同的建立流程呼叫。此方法只登記並設定文字，不建立 handle。 */
        trackUnit(target: unit): void {
            units.add(target);
            untracked(() => applyUnit(target));
        },
        /** 在共同的物品建立流程呼叫；涵蓋直接建立在背包內的物品。 */
        trackItem(target: item): void {
            items.add(target);
            untracked(() => applyItem(target));
        },
        /** 移除原生物件前，須在共同流程取消登記，以免保留失效 handle。 */
        forgetUnit(target: unit): void {
            units.delete(target);
        },
        forgetItem(target: item): void {
            items.delete(target);
        },
        destroy(): void {
            effect.destroy();
            units.clear();
            items.clear();
        },
    };
}
