import { ClassId, HeroState, levelUp, runeScholar } from "@entities/character";
import {
    createItem,
    EquipSlot,
    ItemBaseId,
    ItemInstance,
    ItemTier,
    getAffixRange,
    getItemBase,
    tierAffixCounts,
} from "@entities/item";
import { emptyEquipment, equip } from "@features/equipment";
import {
    createDemoCodec,
    createDemoRegistry,
    initialDemoData,
    SaveCodec,
    SaveData,
    SaveParticipant,
} from "@features/save";
import { loadCommands } from "@features/save";
import { decodeFileData } from "@shared/lib/file-io";
import { saveFilePath } from "@features/save";
import {
    createHeroSaveParticipantsV3 as createHeroSaveParticipants,
    decodeHeroSaveV3 as decodeHeroSave,
    encodeHeroSaveV3 as encodeHeroSave,
    HeroSnapshotV3 as HeroSnapshot,
} from "../../src/app/hero-save";
import { HeroExample } from "../../src/app/hero-example";
import { combatFixture } from "../combat/integration-cases";
import { setupSave } from "../save/setup";

function check(value: boolean): void {
    if (!value) throw new Error("英雄存檔案例結果錯誤。");
}
export function saveFixture(full = false): HeroSnapshot {
    let hero: HeroState = runeScholar;
    if (full)
        for (let index = 1; index < 5; index++) {
            const result = levelUp(hero, ClassId.RuneApprentice);
            check(result.ok);
            if (result.ok) hero = result.hero;
        }
    let worn = emptyEquipment();
    let id = 100;
    for (const base of [
        ItemBaseId.RuneStaff,
        ...(full ? [ItemBaseId.SpellManual] : []),
        ItemBaseId.ApprenticeRobe,
    ]) {
        const result = equip(
            hero,
            worn,
            createItem(id++, base, (low) => low),
        );
        check(result.ok);
        if (result.ok) worn = result.state;
    }
    const held: ItemInstance[] = [];
    if (full)
        for (let index = 0; index < 12; index++)
            held.push(
                createItem(
                    id++,
                    index % 2 === 0 ? ItemBaseId.TrainingSword : ItemBaseId.ApprenticeRobe,
                    (_, high) => high,
                ),
            );
    return { hero, worn, held };
}
export function saveData(full = false): SaveData {
    const encoded = encodeHeroSave(saveFixture(full));
    check(encoded !== undefined);
    return { ...initialDemoData(), ...encoded! };
}
function sameData(actual: SaveData, expected: SaveData): void {
    for (const section of Object.keys(expected))
        for (const field of Object.keys(expected[section])) {
            const a = actual[section][field],
                b = expected[section][field];
            check(Array.isArray(b) ? Array.isArray(a) && a.join(",") === b.join(",") : a === b);
        }
}
const owner = {} as player;
export const heroSaveCases: { name: string; run: (this: void) => void }[] = [];
for (const full of [false, true]) {
    const filled = full;
    heroSaveCases.push({
        name: filled
            ? "英雄存檔五級滿裝與十二件持有物來回"
            : "英雄存檔預建英雄起始裝備與空持有清單來回",
        run() {
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            const data = saveData(filled);
            const code = codec.encode(data, "玩家Alice")!;
            const loaded = codec.decode(code, "玩家Alice")!;
            sameData(loaded, data);
            const restored = decodeHeroSave(loaded);
            check(restored !== undefined && restored.present);
            if (restored?.present) {
                sameData(encodeHeroSave(restored)!, { hero: data.hero, equipment: data.equipment });
                check(restored.hero.attributes.intelligence === (filled ? 20 : 16));
                check(restored.held.length === (filled ? 12 : 0));
                check(restored.worn[EquipSlot.Tool] === undefined);
            }
        },
    });
}
heroSaveCases.push({
    name: "英雄空裝備與空持有清單來回",
    run() {
        const data = encodeHeroSave({ hero: runeScholar, worn: emptyEquipment(), held: [] })!;
        const loaded = decodeHeroSave(data);
        check(loaded !== undefined && loaded.present);
        if (loaded?.present)
            check(
                loaded.held.length === 0 &&
                    Object.values(loaded.worn).every((item) => item === undefined),
            );
    },
});
for (const tier of [ItemTier.Fine, ItemTier.Masterwork, ItemTier.Legendary]) {
    const selected = tier;
    heroSaveCases.push({
        name: `英雄存檔階級來回：${selected === ItemTier.Fine ? "精良" : selected === ItemTier.Masterwork ? "名品" : "傳世"}`,
        run() {
            const snapshot = saveFixture(true);
            const held = snapshot.held.map((item) => ({
                ...item,
                tier: selected,
                affixes: getItemBase(item.baseId)
                    .affixPool.slice(0, tierAffixCounts[selected])
                    .map((entry) => ({
                        affixId: entry.affixId,
                        value: getAffixRange(entry.affixId, selected)[1],
                    })),
            }));
            const data = encodeHeroSave({ ...snapshot, held })!;
            check(data !== undefined);
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            const code = codec.encode({ ...initialDemoData(), ...data }, "Alice")!;
            const restored = decodeHeroSave(codec.decode(code, "Alice")!);
            check(restored !== undefined && restored.present);
            if (restored?.present) sameData(encodeHeroSave(restored)!, data);
        },
    });
}
heroSaveCases.push({
    name: "保存的空知識不被預建知識覆蓋",
    run() {
        const data = encodeHeroSave({
            hero: { ...runeScholar, knowledge: [] },
            worn: emptyEquipment(),
            held: [],
        })!;
        const restored = decodeHeroSave(data);
        check(restored !== undefined && restored.present);
        if (restored?.present) check(restored.hero.knowledge.length === 0);
    },
});
type Mutation = (this: void, data: SaveData) => void;
const invalid: readonly [string, Mutation][] = [
    [
        "預建英雄索引超出目錄",
        (data) => {
            data.hero.preset = 15;
        },
    ],
    [
        "職業索引超出目錄",
        (data) => {
            (data.hero.classIds as number[])[0] = 15;
        },
    ],
    [
        "基底索引超出目錄",
        (data) => {
            (data.equipment.bases as number[])[0] = 63;
        },
    ],
    [
        "詞綴索引超出目錄",
        (data) => {
            (data.equipment.affixIds as number[])[0] = 31;
        },
    ],
    [
        "職業重複",
        (data) => {
            (data.hero.classIds as number[])[1] = 1;
            (data.hero.classLevels as number[])[1] = 1;
        },
    ],
    [
        "職業低於預建等級",
        (data) => {
            (data.hero.classLevels as number[])[0] = 0;
        },
    ],
    [
        "職業超過最高等級",
        (data) => {
            (data.hero.classLevels as number[])[0] = 6;
        },
    ],
    [
        "遺失預建認證職業",
        (data) => {
            data.hero.classIds = [0, 0, 0, 0];
            data.hero.classLevels = [0, 0, 0, 0];
        },
    ],
    [
        "空職業的等級非零",
        (data) => {
            (data.hero.classLevels as number[])[1] = 1;
        },
    ],
    [
        "知識索引超出目錄",
        (data) => {
            (data.hero.knowledge as number[])[31] = 1;
        },
    ],
    [
        "空英雄含有資料",
        (data) => {
            data.hero.present = false;
        },
    ],
    [
        "空物品的階級非零",
        (data) => {
            (data.equipment.tiers as number[])[3] = 1;
        },
    ],
    [
        "空物品含有詞綴",
        (data) => {
            (data.equipment.affixIds as number[])[12] = 1;
        },
    ],
    [
        "空詞綴的值非零",
        (data) => {
            (data.equipment.affixValues as number[])[1] = 1;
        },
    ],
    [
        "詞綴不連續",
        (data) => {
            (data.equipment.affixIds as number[])[2] = 1;
            (data.equipment.affixValues as number[])[2] = 2;
        },
    ],
    [
        "詞綴數量與階級不符",
        (data) => {
            (data.equipment.tiers as number[])[0] = 1;
        },
    ],
    [
        "詞綴重複",
        (data) => {
            (data.equipment.tiers as number[])[0] = 1;
            (data.equipment.affixIds as number[])[1] = (data.equipment.affixIds as number[])[0];
            (data.equipment.affixValues as number[])[0] = 4;
            (data.equipment.affixValues as number[])[1] = 4;
        },
    ],
    [
        "詞綴與基底不相容",
        (data) => {
            (data.equipment.affixIds as number[])[0] = 11;
            (data.equipment.affixValues as number[])[0] = 8;
        },
    ],
    [
        "詞綴不在基底池",
        (data) => {
            (data.equipment.affixIds as number[])[0] = 1;
            (data.equipment.affixValues as number[])[0] = 2;
        },
    ],
    [
        "詞綴值高於階級區間",
        (data) => {
            (data.equipment.affixValues as number[])[0] = 63;
        },
    ],
    [
        "詞綴值低於階級區間",
        (data) => {
            (data.equipment.affixValues as number[])[0] = 0;
        },
    ],
    [
        "物品保存於錯誤位置",
        (data) => {
            (data.equipment.bases as number[])[0] = 5;
            (data.equipment.affixIds as number[])[0] = 11;
            (data.equipment.affixValues as number[])[0] = 8;
        },
    ],
    [
        "雙手主武器與副手衝突",
        (data) => {
            (data.equipment.bases as number[])[0] = 3;
            (data.equipment.affixIds as number[])[0] = 12;
            (data.equipment.affixValues as number[])[0] = 2;
        },
    ],
    [
        "穿戴時缺少保存的知識",
        (data) => {
            data.hero.knowledge = Array.from({ length: 32 }, () => 0);
        },
    ],
    [
        "英雄清單長度錯誤",
        (data) => {
            data.hero.classIds = [1];
        },
    ],
    [
        "裝備清單長度錯誤",
        (data) => {
            data.equipment.bases = [1];
        },
    ],
    [
        "欄位含有非整數",
        (data) => {
            (data.hero.classLevels as number[])[0] = 1.5;
        },
    ],
    [
        "知識旗標超出範圍",
        (data) => {
            (data.hero.knowledge as number[])[0] = 2;
        },
    ],
];
for (const [name, mutate] of invalid) {
    const title = name,
        change = mutate;
    heroSaveCases.push({
        name: `英雄解碼拒絕${title}`,
        run() {
            const data = saveData(true);
            change(data);
            check(decodeHeroSave(data) === undefined);
        },
    });
}
const invalidSource: readonly [string, (this: void, snapshot: HeroSnapshot) => HeroSnapshot][] = [
    ["未知知識", (s) => ({ ...s, hero: { ...s.hero, knowledge: ["未知"] } })],
    ["未知職業", (s) => ({ ...s, hero: { ...s.hero, classes: [{ classId: "未知", level: 1 }] } })],
    [
        "職業超過四個",
        (s) => ({
            ...s,
            hero: {
                ...s.hero,
                classes: [
                    ...s.hero.classes,
                    ...s.hero.classes,
                    ...s.hero.classes,
                    ...s.hero.classes,
                    ...s.hero.classes,
                ],
            },
        }),
    ],
    ["未知基底", (s) => ({ ...s, held: [{ ...s.held[0], baseId: "未知" }] })],
    [
        "未知詞綴",
        (s) => ({ ...s, held: [{ ...s.held[0], affixes: [{ affixId: "未知", value: 1 }] }] }),
    ],
    [
        "詞綴超過四個",
        (s) => ({
            ...s,
            held: [
                { ...s.held[0], affixes: Array.from({ length: 5 }, () => s.held[0].affixes[0]) },
            ],
        }),
    ],
    ["持有物超過十二件", (s) => ({ ...s, held: [...s.held, s.held[0]] })],
];
for (const [name, mutate] of invalidSource) {
    const title = name,
        change = mutate;
    heroSaveCases.push({
        name: `英雄編碼拒絕${title}`,
        run() {
            check(encodeHeroSave(change(saveFixture(true))) === undefined);
        },
    });
}
heroSaveCases.push(
    {
        name: "版本二轉版本三保留範例且沒有英雄資料",
        run() {
            const old = { demo: { level: 37, gold: 654321, items: [3, 2, 1, 0, 1, 2] } };
            const code = createDemoCodec().encode(old, "Alice")!;
            const next = createDemoCodec(createHeroSaveParticipants(owner)).decode(code, "Alice")!;
            sameData(next, old);
            check(next.hero.present === false && decodeHeroSave(next)?.present === false);
            check(new SaveCodec(createDemoRegistry(), 2).encode(old, "Alice") === code);
        },
    },
    {
        name: "版本一依序轉版本三且只補空資料",
        run() {
            const code = new SaveCodec(createDemoRegistry(), 1).encode(
                { demo: { level: 7, gold: 123, items: [1, 2, 3] } },
                "Alice",
            )!;
            const next = createDemoCodec(createHeroSaveParticipants(owner)).decode(code, "Alice")!;
            check(
                next.hero.present === false &&
                    (next.demo.items as number[]).join(",") === "1,2,3,0,0,0",
            );
        },
    },
    {
        name: "其他玩家收集空英雄且拒絕英雄資料",
        run() {
            const f = combatFixture();
            const demo = new HeroExample(
                f.registry,
                f.hero,
                (low) => low,
                () => {},
            );
            const participants = createHeroSaveParticipants(owner, demo);
            const other = {} as player;
            check(participants[0].collect(owner)!.present === true);
            check(participants[0].collect(other)!.present === false);
            check(participants[0].prepare(other, saveData().hero) === undefined);
            check(participants[1].prepare(owner, saveData().equipment) === undefined);
        },
    },
    {
        name: "快照獨立且恢復重新編號後接續建立物品",
        run() {
            const f = combatFixture();
            const demo = new HeroExample(
                f.registry,
                f.hero,
                (low) => low,
                () => {},
            );
            const saved = saveFixture(true);
            demo.restore(saved.hero, saved.worn, saved.held);
            const snapshot = demo.snapshot();
            check(
                snapshot.hero !== demo.hero &&
                    snapshot.worn[EquipSlot.MainHand] !== demo.equipment[EquipSlot.MainHand],
            );
            check(
                demo.equipment[EquipSlot.MainHand]!.id === 1 &&
                    (demo.items[0] as ItemInstance).id === 4 &&
                    (demo.items[11] as ItemInstance).id === 15,
            );
            const data = encodeHeroSave(snapshot)!;
            sameData(data, { hero: saveData(true).hero, equipment: saveData(true).equipment });
            demo.restore(saved.hero, saved.worn, saved.held.slice(0, 11));
            demo.command("-item-new 訓練短劍");
            check((demo.items[11] as ItemInstance).id === 15);
            demo.restore(runeScholar, emptyEquipment(), []);
            demo.command("-item-new 訓練短劍");
            check(
                (demo.items[0] as ItemInstance).id === 1 &&
                    demo.equipment[EquipSlot.MainHand] === undefined,
            );
            check(
                demo.summary.mainWeapon === undefined &&
                    f.registry.require(f.hero).profile.weapon === undefined,
            );
        },
    },
    {
        name: "恢復使用既有生命規則且失能維持零",
        run() {
            const f = combatFixture();
            let changes = 0;
            const demo = new HeroExample(
                f.registry,
                f.hero,
                (low) => low,
                () => {
                    changes++;
                },
            );
            const snapshot = saveFixture(true);
            f.registry.setLife(f.hero, 0, 0);
            demo.restore(snapshot.hero, snapshot.worn, snapshot.held);
            check(f.registry.require(f.hero).life.life === 0 && changes === 2);
            check(f.registry.caster(f.hero).level === 5);
        },
    },
);

function heroChat() {
    const examples: HeroExample[] = [];
    const setup = setupSave(undefined, (player, client) => {
        const f = combatFixture();
        const demo = new HeroExample(
            f.registry,
            f.hero,
            (low) => low,
            () => {},
        );
        examples[client] = demo;
        return createHeroSaveParticipants(player, demo);
    });
    return { ...setup, examples };
}
heroSaveCases.push(
    {
        name: "英雄分段讀檔到齊才恢復且竄改不改狀態",
        run() {
            const s = heroChat();
            try {
                s.command("-save");
                const code = decodeFileData(s.files[0].getData(saveFilePath)!)!;
                const commands = loadCommands(code);
                check(commands.length === 3 && commands.every((command) => command.length <= 92));
                for (const demo of s.examples) demo.command("-hero-up");
                s.command(commands[0]);
                s.command(commands[1]);
                check(s.examples.every((demo) => demo.hero.classes[0].level === 2));
                s.command(commands[2]);
                check(s.examples.every((demo) => demo.hero.classes[0].level === 1));
                const modified = "U" + code.slice(1);
                s.command(`-load ${modified}`);
                check(s.examples.every((demo) => demo.hero.classes[0].level === 1));
                check(s.displays[s.displays.length - 1].text === "存檔碼無效。");
            } catch (error) {
                s.close();
                throw error;
            }
            s.close();
        },
    },
    {
        name: "英雄自動讀檔在全部用戶端恢復後範例一致",
        run() {
            const s = heroChat();
            try {
                const full = saveFixture(true);
                for (const demo of s.examples) demo.restore(full.hero, full.worn, full.held);
                s.command("-save-demo gold 500");
                s.command("-save");
                for (const demo of s.examples) demo.restore(runeScholar, emptyEquipment(), []);
                s.command("-save-demo gold 1");
                s.command("-load");
                check(s.examples.every((demo) => demo.hero.classes[0].level === 1));
                s.network.flush();
                for (const demo of s.examples)
                    sameData(encodeHeroSave(demo.snapshot())!, encodeHeroSave(full)!);
                for (const service of s.services)
                    check(service.states.get(s.network.players[0])!.demo.gold === 500);
                check(s.files[1].writes() === 0);
            } catch (error) {
                s.close();
                throw error;
            }
            s.close();
        },
    },
    {
        name: "英雄手動讀檔與舊碼不改英雄",
        run() {
            const s = heroChat();
            try {
                s.command("-save");
                const code = decodeFileData(s.files[0].getData(saveFilePath)!)!;
                for (const demo of s.examples) demo.command("-hero-up");
                s.command(`-load ${code}`);
                check(s.examples.every((demo) => demo.hero.classes[0].level === 1));
                const old = createDemoCodec().encode(
                    { demo: { level: 9, gold: 123, items: [0, 1, 2, 3, 0, 1] } },
                    s.names.get(s.network.players[0])!,
                )!;
                for (const demo of s.examples) demo.command("-hero-up");
                s.command(`-load ${old}`);
                check(s.examples.every((demo) => demo.hero.classes[0].level === 2));
                check(
                    s.services.every(
                        (service) => service.states.get(s.network.players[0])!.demo.gold === 123,
                    ),
                );
            } catch (error) {
                s.close();
                throw error;
            }
            s.close();
        },
    },
    {
        name: "裝備驗證失敗時英雄與範例全部不套用",
        run() {
            const s = heroChat();
            try {
                const invalid = saveData(true);
                invalid.demo.gold = 999;
                invalid.hero.knowledge = Array.from({ length: 32 }, () => 0);
                const code = createDemoCodec(
                    createHeroSaveParticipants(s.network.players[0]),
                ).encode(invalid, s.names.get(s.network.players[0])!)!;
                check(code !== undefined);
                s.command(`-load ${code}`);
                check(
                    s.examples.every(
                        (demo) =>
                            demo.hero.classes[0].level === 1 &&
                            demo.items.every((item) => item === false),
                    ),
                );
                check(
                    s.services.every(
                        (service) => service.states.get(s.network.players[0])!.demo.gold === 0,
                    ),
                );
                check(s.displays.length === 1 && s.displays[0].text === "存檔碼無效。");
            } catch (error) {
                s.close();
                throw error;
            }
            s.close();
        },
    },
    {
        name: "通用參與者先全部驗證才執行套用",
        run() {
            const events: string[] = [];
            let reject = true;
            const s = setupSave(undefined, (_, client) =>
                ["first", "last"].map((name): SaveParticipant => ({
                    section: { name, fields: [{ name: "value", kind: "uint", min: 0, max: 1 }] },
                    empty: { value: 0 },
                    collect: () => ({ value: 1 }),
                    prepare: () => {
                        events.push(`${client}:${name}:驗證`);
                        if (reject && name === "last") return undefined;
                        return () => {
                            events.push(`${client}:${name}:套用`);
                        };
                    },
                })),
            );
            try {
                s.command("-save-demo gold 22");
                s.command("-save");
                const code = decodeFileData(s.files[0].getData(saveFilePath)!)!;
                s.command("-save-demo gold 1");
                s.command(`-load ${code}`);
                check(events.join(",") === "0:first:驗證,0:last:驗證,1:first:驗證,1:last:驗證");
                check(
                    s.services.every(
                        (service) => service.states.get(s.network.players[0])!.demo.gold === 1,
                    ),
                );
                reject = false;
                events.length = 0;
                s.command(`-load ${code}`);
                check(
                    events.join(",") ===
                        "0:first:驗證,0:last:驗證,0:first:套用,0:last:套用,1:first:驗證,1:last:驗證,1:first:套用,1:last:套用",
                );
                check(
                    s.services.every(
                        (service) => service.states.get(s.network.players[0])!.demo.gold === 22,
                    ),
                );
            } catch (error) {
                s.close();
                throw error;
            }
            s.close();
        },
    },
    {
        name: "參與者收集失敗時不寫入檔案",
        run() {
            const s = setupSave(undefined, () => [
                {
                    section: { name: "extra", fields: [{ name: "ok", kind: "boolean" }] },
                    empty: { ok: false },
                    collect: () => undefined,
                    prepare: () => () => {},
                },
            ]);
            try {
                s.command("-save");
                check(s.files.every((file) => file.writes() === 0));
            } catch (error) {
                s.close();
                throw error;
            }
            s.close();
        },
    },
);
