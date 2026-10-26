import { I18nNatives } from "../../src/shared/wc3-def/i18n-natives";
import { ObjectTextData } from "../../src/shared/i18n/object-text";

export interface TextCall {
    field: string;
    text: string;
    level: number;
    target: unknown;
}

export function fakeNatives() {
    const calls: TextCall[] = [];
    const natives: I18nNatives = {
        getLocale: () => "zhTW",
        abilityText: (id, field, level, text) => {
            calls.push({ target: id, field, level, text });
        },
        itemText: (target, field, text) => {
            calls.push({ target, field, level: 0, text });
        },
        unitName: (target, text) => {
            calls.push({ target, field: "name", level: 0, text });
        },
        heroName: (target, text) => {
            calls.push({ target, field: "properNames", level: 0, text });
        },
        unitType: () => 1211124017,
        itemType: () => 1227901233,
        isHero: () => true,
        watchUnits: () => () => {},
        visitItems: () => {},
    };
    return { calls, natives };
}

export function fixtureData(): ObjectTextData {
    return {
        entries: [
            { key: "ability:A0I1:tip:1", kind: "ability", id: 1093683505, field: "tip", level: 1 },
            {
                key: "ability:A0I1:ubertip:2",
                kind: "ability",
                id: 1093683505,
                field: "ubertip",
                level: 2,
            },
            { key: "unit:H0I1:name", kind: "unit", id: 1211124017, field: "name", level: 0 },
            {
                key: "unit:H0I1:properNames",
                kind: "unit",
                id: 1211124017,
                field: "properNames",
                level: 0,
            },
            {
                key: "unit:H0I1:description",
                kind: "unit",
                id: 1211124017,
                field: "description",
                level: 0,
            },
            { key: "item:I0I1:name", kind: "item", id: 1227901233, field: "name", level: 0 },
        ],
        tables: {
            "zh-TW": {
                "ability:A0I1:tip:1": "技能一",
                "ability:A0I1:ubertip:2": "技能二說明",
                "unit:H0I1:name": "守衛",
                "unit:H0I1:properNames": "明光",
                "unit:H0I1:description": "單位說明",
                "item:I0I1:name": "護符",
            },
            "zh-CN": { "unit:H0I1:name": "守卫", "item:I0I1:name": "护符" },
            "en-US": { "unit:H0I1:name": "Guard", "item:I0I1:name": "Charm" },
        },
    };
}
