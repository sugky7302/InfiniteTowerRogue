import { strict as assert } from "node:assert";
import { test } from "node:test";
import { wc3I18nNatives } from "../../src/shared/lib/i18n/natives";
import { createI18n, getI18n, t } from "../../src/shared/lib/i18n/translation";
import { createObjectText } from "../../src/shared/lib/i18n/object-text";
import { fixtureData } from "./fake-natives";
import { config } from "../../src/shared/lib/rxwc3/core/config";

function withGlobals(values: Record<string, unknown>, run: () => void): void {
    const scope = globalThis as unknown as Record<string, unknown>;
    const previous = Object.keys(values).map(
        (key) => [key, Object.getOwnPropertyDescriptor(scope, key)] as const,
    );
    for (const [key, value] of Object.entries(values))
        Object.defineProperty(scope, key, { value, writable: true, configurable: true });
    try {
        run();
    } finally {
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(scope, key, descriptor);
            else delete scope[key];
        }
    }
}

test("公開 t 函式使用正式服務並追蹤本地語言", () => {
    withGlobals({ BlzGetLocale: () => "enUS" }, () => {
        assert.equal(t("example.greeting", { name: "旅人" }), "Hello, 旅人.");
        getI18n().language.set("zh-CN");
        assert.equal(t("example.ready"), "多语言示例已启动。");
    });
});

test("共同流程預建進入事件並列舉現有單位，新單位事件只設定文字", () => {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    const existing = {} as unit;
    const entering = {} as unit;
    const ground = {} as item;
    const held = {} as item;
    const bounds = {} as rect;
    const area = {} as region;
    const units: unit[] = [];
    const calls: string[] = [];
    let action: (() => void) | undefined;
    let enumerated = 0;
    const created: string[] = [];
    const destroyed: string[] = [];
    let local = false;
    const create = (name: string): object => {
        assert.equal(local, false);
        created.push(name);
        return {};
    };
    try {
        withGlobals(
            {
                BlzGetLocale: () => "zhTW",
                GetWorldBounds: () => {
                    create("區域矩形");
                    return bounds;
                },
                CreateRegion: () => {
                    create("區域");
                    return area;
                },
                RegionAddRect: (r: region, b: rect) => {
                    assert.equal(r, area);
                    assert.equal(b, bounds);
                },
                CreateTrigger: () => create("觸發器"),
                TriggerRegisterEnterRegion: (_t: trigger, r: region, filter: unknown) => {
                    assert.equal(r, area);
                    assert.equal(filter, undefined);
                },
                TriggerAddAction: (_t: trigger, callback: () => void) => {
                    action = callback;
                },
                GetEnteringUnit: () => entering,
                CreateGroup: () => create("群組"),
                GroupEnumUnitsInRect: () => {
                    units.push(existing);
                },
                FirstOfGroup: () => units[0],
                GroupRemoveUnit: () => {
                    units.shift();
                },
                DestroyGroup: () => {
                    destroyed.push("群組");
                },
                DestroyTrigger: () => {
                    destroyed.push("觸發器");
                },
                RemoveRegion: () => {
                    destroyed.push("區域");
                },
                RemoveRect: () => {
                    destroyed.push("區域矩形");
                },
                GetUnitTypeId: () => 1211124017,
                GetItemTypeId: () => 1227901233,
                UNIT_TYPE_HERO: {},
                IsUnitType: () => true,
                BlzSetUnitName: (_target: unit, text: string) => {
                    calls.push(text);
                },
                BlzSetHeroProperName: (_target: unit, text: string) => {
                    calls.push(text);
                },
                BlzSetItemName: (_target: item, text: string) => {
                    calls.push(text);
                },
                BlzSetAbilityTooltip: () => {},
                BlzSetAbilityExtendedTooltip: () => {},
                EnumItemsInRect: (_r: rect, _f: unknown, callback: () => void) => {
                    callback();
                    enumerated++;
                },
                GetEnumItem: () => ground,
                UnitItemInSlot: (_target: unit, slot: number) => (slot === 0 ? held : undefined),
            },
            () => {
                const service = createI18n(wc3I18nNatives);
                const objects = createObjectText(service, fixtureData(), wc3I18nNatives);
                const stop = wc3I18nNatives.watchUnits((target) => objects.trackUnit(target));
                wc3I18nNatives.visitItems((target) => objects.trackItem(target));
                assert.equal(enumerated, 1);
                assert.equal(calls.filter((text) => text === "護符").length, 2);
                const handles = created.length;
                action!();
                assert.equal(created.length, handles);
                calls.length = 0;
                local = true;
                service.language.set("en-US");
                local = false;
                assert.equal(created.length, handles);
                assert.equal(calls.filter((text) => text === "Guard").length, 2);
                assert.equal(calls.filter((text) => text === "Charm").length, 2);
                objects.destroy();
                stop();
                assert.deepEqual(created.sort(), destroyed.sort());
            },
        );
        assert.deepEqual(errors, []);
    } finally {
        config.onUnhandledError = saved;
    }
});
