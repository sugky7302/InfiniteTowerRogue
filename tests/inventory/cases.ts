import { runeScholar } from "@entities/character";
import {
    ItemBaseId,
    ItemInstance,
    ItemTier,
    getItemBase,
    getAffixRange,
    tierAffixCounts,
    EquipSlot,
} from "@entities/item";
import {
    createBag,
    firstEmptySlot,
    putInBag,
    takeFromBag,
    swapBagSlots,
    findBagSlot,
    emptyEquipment,
    nativeItemTypes,
} from "@features/equipment";
import {
    createDemoRegistry,
    createDemoCodec,
    SaveCodec,
    SaveData,
    SaveRecord,
    compactCode,
    initialDemoData,
    loadCommands,
    saveFilePath,
} from "@features/save";
import { encodeFileData, decodeFileData } from "@shared/file-io";
import { HeroExample } from "../../src/app/hero-example";
import { NativeItemRegistry } from "../../src/app/native-item-registry";
import {
    createHeroSaveParticipants,
    createHeroSaveParticipantsV3,
    decodeHeroSave,
    encodeHeroSave,
    migrateEquipmentV3,
    HeroSnapshot,
} from "../../src/app/hero-save";
import { saveFixture, saveData } from "../hero-save/cases";
import { fakeItemCarriers } from "./fake-item-carriers";
import { combatFixture } from "../combat/integration-cases";
import { setupSave } from "../save/setup";
import { legacyCodes } from "./legacy-codes";

function check(value: boolean): void {
    if (!value) throw new Error("物品欄案例結果錯誤。");
}
function rejects(callback: (this: void) => void): void {
    let failed = false;
    try {
        callback();
    } catch {
        failed = true;
    }
    check(failed);
}
const owner = {} as player;
export function inventoryItem(
    id = 1,
    base: ItemBaseId = ItemBaseId.TrainingSword,
    tier: ItemTier = ItemTier.Common,
): ItemInstance {
    return {
        id,
        baseId: base,
        tier,
        affixes: getItemBase(base)
            .affixPool.slice(0, tierAffixCounts[tier])
            .map((entry) => ({
                affixId: entry.affixId,
                value: getAffixRange(entry.affixId, tier)[1],
            })),
    };
}
export function inventoryData(count = 0, legendary = false): SaveData {
    const snapshot = saveFixture();
    const held: ItemInstance[] = [];
    for (let index = 0; index < count; index++)
        held.push(
            inventoryItem(
                index + 10,
                ItemBaseId.TrainingSword,
                legendary ? ItemTier.Legendary : ItemTier.Common,
            ),
        );
    return { ...initialDemoData(), ...encodeHeroSave({ ...snapshot, held })! };
}
/** 94 筆是格式上限。現有目錄沒有工具，所以合法英雄最多保存 93 件。 */
export function worstInventoryData(): SaveData {
    const data = inventoryData();
    const record = (inventoryData(1, true).equipment.items as SaveRecord[])[2];
    const items: SaveRecord[] = [];
    for (let slot = 0; slot < 94; slot++) items.push({ ...record, slot });
    return { ...data, equipment: { items } };
}
function rows(data: SaveData): SaveRecord[] {
    return data.equipment.items as SaveRecord[];
}
function equivalent(actual: SaveData, expected: SaveData): void {
    const registry = createDemoRegistry(createHeroSaveParticipants(owner));
    check(registry.pack(actual, 4)!.join(",") === registry.pack(expected, 4)!.join(","));
}
function example() {
    const combat = combatFixture();
    const hero = combat.hero;
    const demo = new HeroExample(
        combat.registry,
        hero,
        (low) => low,
        () => {},
    );
    const native = fakeItemCarriers();
    let full = 0;
    const carriers = new NativeItemRegistry(
        native.natives,
        hero,
        (item) => {
            check(native.actions[0] === "移出物品欄");
            return demo.acceptPickup(item);
        },
        () => {
            full++;
        },
    );
    demo.attachCarriers(carriers);
    return { demo, native, carriers, full: () => full };
}
export const inventoryCases: { name: string; run: (this: void) => void }[] = [
    {
        name: "版本一至三固定舊碼維持碼值且可轉換版本四",
        run() {
            const registry = createDemoRegistry(createHeroSaveParticipantsV3(owner));
            const current = createDemoCodec(createHeroSaveParticipants(owner));
            for (let version = 1; version <= 3; version++) {
                const data: SaveData = {
                    demo: {
                        level: 7,
                        gold: 1234,
                        items: version === 1 ? [1, 2, 3] : [1, 2, 3, 0, 0, 0],
                    },
                };
                if (version === 3) Object.assign(data, saveData(true), { demo: data.demo });
                const oldCode = new SaveCodec(registry, version).encode(data, "本地玩家")!;
                check(oldCode === legacyCodes[version - 1]);
                const decoded = current.decode(legacyCodes[version - 1], "本地玩家")!;
                check(decoded.demo.level === 7 && decoded.demo.gold === 1234);
                const restored = decodeHeroSave(decoded)!;
                check(restored.present === (version === 3));
                if (restored.present)
                    check(
                        restored.hero.classes[0].level === 5 &&
                            restored.held.filter((item) => item !== false).length === 12,
                    );
            }
        },
    },
    {
        name: "合法93件傳世物品完整解碼並保留90格背包",
        run() {
            const snapshot = saveFixture(true);
            const worn = { ...emptyEquipment() };
            for (const slot of Object.values(EquipSlot)) {
                const item = snapshot.worn[slot];
                if (item !== undefined)
                    worn[slot] = inventoryItem(
                        item.id,
                        item.baseId as ItemBaseId,
                        ItemTier.Legendary,
                    );
            }
            const held: ItemInstance[] = [];
            for (let index = 0; index < 90; index++)
                held.push(inventoryItem(index + 10, ItemBaseId.TrainingSword, ItemTier.Legendary));
            const data = { ...initialDemoData(), ...encodeHeroSave({ ...snapshot, worn, held })! };
            check(rows(data).length === 93);
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            const restored = decodeHeroSave(codec.decode(codec.encode(data, "Alice")!, "Alice")!)!;
            check(restored.present);
            if (restored.present) {
                check(
                    restored.held.length === 90 &&
                        restored.held.every(
                            (item) =>
                                item !== false &&
                                item !== undefined &&
                                item.tier === ItemTier.Legendary,
                        ),
                );
                equivalent({ ...initialDemoData(), ...encodeHeroSave(restored)! }, data);
            }
        },
    },
    {
        name: "90 格背包純規則保留空格且不修改輸入",
        run() {
            const empty = createBag();
            check(empty.length === 90 && firstEmptySlot(empty) === 0);
            const first = inventoryItem(),
                second = inventoryItem(2);
            const bag = putInBag(empty, first)!;
            check(empty[0] === false && bag[0] === first && findBagSlot(bag, 1) === 0);
            check(putInBag(bag, first) === undefined && findBagSlot(bag, 99) === undefined);
            const swapped = swapBagSlots(bag, 0, 89)!;
            check(swapped[0] === false && swapped[89] === first && bag[0] === first);
            check(swapBagSlots(swapped, 89, 89)![89] === first);
            const next = putInBag(swapped, second)!;
            check(next[0] === second);
            const taken = takeFromBag(next, 89)!;
            check(taken.item === first && taken.bag[89] === false && next[89] === first);
            check(takeFromBag(empty, 0) === undefined);
            for (const slot of [-1, 90, 0.5, NaN]) {
                check(
                    takeFromBag(bag, slot) === undefined &&
                        swapBagSlots(bag, slot, 0) === undefined &&
                        swapBagSlots(bag, 0, slot) === undefined,
                );
            }
            let full = empty;
            for (let index = 0; index < 90; index++)
                full = putInBag(full, inventoryItem(index + 1))!;
            check(
                firstEmptySlot(full) === undefined &&
                    putInBag(full, inventoryItem(100)) === undefined,
            );
        },
    },
    {
        name: "版本四保存背包第九十格與中間空格並依位置重新編號",
        run() {
            const bag = createBag([inventoryItem(40)]);
            const moved = swapBagSlots(bag, 0, 89)!;
            const snapshot: HeroSnapshot = { ...saveFixture(), held: moved };
            const data = { ...initialDemoData(), ...encodeHeroSave(snapshot)! };
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            check(codec.version === 4);
            const loaded = decodeHeroSave(codec.decode(codec.encode(data, "Alice")!, "Alice")!);
            check(loaded !== undefined && loaded.present);
            if (loaded?.present) {
                check(
                    loaded.held.length === 90 &&
                        loaded.held[0] === false &&
                        (loaded.held[89] as ItemInstance).id === 3,
                );
                equivalent({ ...initialDemoData(), ...encodeHeroSave(loaded)! }, data);
            }
        },
    },
    {
        name: "版本四起始裝備與十二件普通物品使用可變碼長",
        run() {
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            for (const count of [0, 12, 90]) {
                const data = inventoryData(count);
                const code = codec.encode(data, "Alice")!;
                const loaded = codec.decode(code, "Alice")!;
                equivalent(loaded, data);
                check(decodeHeroSave(loaded)?.present === true);
                check(code.length === (count === 0 ? 79 : count === 12 ? 153 : 641));
            }
        },
    },
    {
        name: "版本四94件傳世紀錄可經檔案、手動分段與亂序同步來回",
        run() {
            const data = worstInventoryData();
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            const code = codec.encode(data, "Alice")!;
            check(code.length <= 1600 && compactCode(code).length > 1000);
            check(decodeFileData(encodeFileData(code)!) === code);
            equivalent(codec.decode(code, "Alice")!, data);
            check(loadCommands(code).every((command) => command.length < 127));
            const setup = setupSave(codec);
            try {
                const name = setup.names.get(setup.network.players[0])!;
                setup.files[0].files.set(saveFilePath, encodeFileData(codec.encode(data, name)!)!);
                setup.command("-load");
                check(
                    setup.network.packets.length === Math.ceil(code.length / 200) &&
                        setup.network.packets.length <= 64,
                );
                setup.network.packets.reverse();
                setup.network.flush();
                for (const service of setup.services)
                    equivalent(service.states.get(setup.network.players[0])!, data);
                setup.command("-save-demo gold 99");
                const commands = loadCommands(codec.encode(data, name)!);
                check(commands.length === 15);
                for (const command of commands.reverse()) setup.command(command);
                for (const service of setup.services)
                    equivalent(service.states.get(setup.network.players[0])!, data);
            } catch (error) {
                setup.close();
                throw error;
            }
            setup.close();
        },
    },
    {
        name: "版本三轉四保留穿戴位置與第1至12格，空位不壓縮",
        run() {
            const data = saveData(true);
            const bases = data.equipment.bases as number[];
            bases[5] = 0;
            (data.equipment.tiers as number[])[5] = 0;
            for (let index = 20; index < 24; index++) {
                (data.equipment.affixIds as number[])[index] = 0;
                (data.equipment.affixValues as number[])[index] = 0;
            }
            const old = createDemoCodec(createHeroSaveParticipantsV3(owner));
            const code = old.encode(data, "Alice")!;
            check(code.length === 265);
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            const loaded = codec.decode(code, "Alice")!;
            check(
                rows(loaded)
                    .map((entry) => entry.slot)
                    .join(",") === "0,1,2,4,6,7,8,9,10,11,12,13,14,15",
            );
            const restored = decodeHeroSave(loaded);
            check(restored !== undefined && restored.present);
            if (restored?.present)
                check(
                    restored.held[1] === false &&
                        restored.held[11] !== false &&
                        restored.held[12] === false,
                );
            check(codec.decode(old.encode(saveData(), "Alice")!, "Alice") !== undefined);
        },
    },
    {
        name: "版本一與二依序轉四且不改英雄",
        run() {
            const codec = createDemoCodec(createHeroSaveParticipants(owner));
            for (const version of [1, 2]) {
                const code = new SaveCodec(createDemoRegistry(), version).encode(
                    {
                        demo: {
                            level: 7,
                            gold: 1234,
                            items: version === 1 ? [1, 2, 3] : [1, 2, 3, 0, 0, 0],
                        },
                    },
                    "Alice",
                )!;
                const loaded = codec.decode(code, "Alice")!;
                check(
                    loaded.demo.level === 7 &&
                        loaded.hero.present === false &&
                        rows(loaded).length === 0,
                );
            }
        },
    },
    {
        name: "版本三轉換拒絕空位殘留資料與多餘詞綴",
        run() {
            const data = saveData();
            (data.equipment.tiers as number[])[3] = 1;
            rejects(() => {
                migrateEquipmentV3(data.equipment);
            });
            const extra = saveData();
            (extra.equipment.affixIds as number[])[1] = 1;
            rejects(() => {
                migrateEquipmentV3(extra.equipment);
            });
        },
    },
    {
        name: "原生載體建立、丟棄與撿起立即移出原生物品欄",
        run() {
            const f = example();
            check(f.native.inventory() === 1 && f.carriers.size === 2);
            f.demo.command("-item-new 訓練短劍");
            const handle = f.native.byId(3).handle;
            check(
                f.native.byId(3).code === nativeItemTypes[ItemBaseId.TrainingSword] &&
                    !f.native.byId(3).visible,
            );
            check(f.demo.command("-drop 1")![0] === "已丟棄物品。");
            check(f.demo.items[0] === false && f.native.byId(3).visible && f.carriers.size === 3);
            check(f.native.byId(3).x === 120 && f.native.byId(3).y === -80);
            f.native.pickup(handle);
            check(
                f.native.actions[0] === "移出物品欄" &&
                    !f.native.byId(3).carried &&
                    !f.native.byId(3).visible,
            );
            check((f.demo.items[0] as ItemInstance).id === 3 && f.carriers.size === 3);
            // 重複的拾取事件不得複製資料。
            f.native.pickup(handle);
            check(f.demo.items.filter((item) => item !== false).length === 1);
            f.carriers.destroy();
            check(f.native.live.size === 0 && f.native.stopped());
        },
    },
    {
        name: "背包已滿時撿起留在地面，卸下與新增失敗不改載體",
        run() {
            const f = example();
            f.demo.command("-item-new 訓練短劍");
            f.demo.command("-drop 1");
            const handle = f.native.byId(3).handle;
            for (let index = 0; index < 90; index++) f.demo.command("-item-new 訓練短劍");
            f.native.pickup(handle);
            check(
                f.full() === 1 &&
                    f.native.byId(3).visible &&
                    !f.native.byId(3).carried &&
                    f.carriers.size === 93,
            );
            check(f.demo.command("-item-new 訓練短劍")![0] === "背包已滿");
            check(f.demo.command("-unequip 主武器")![0] === "背包已滿" && f.carriers.size === 93);
            f.demo.command("-drop 1");
            f.native.pickup(handle);
            check((f.demo.items[0] as ItemInstance).id === 3 && f.full() === 1);
            f.carriers.destroy();
        },
    },
    {
        name: "背包交換、穿戴與卸下保留格子並放入第一個空格",
        run() {
            const f = example();
            for (let index = 0; index < 13; index++) f.demo.command("-item-new 訓練短劍");
            check(f.demo.items.filter((item) => item !== false).length === 13);
            f.demo.command("-bag-swap 1 90");
            check((f.demo.items[89] as ItemInstance).id === 3 && f.demo.items[0] === false);
            f.demo.command("-equip 3");
            check(
                f.demo.equipment[EquipSlot.MainHand]!.id === 3 &&
                    (f.demo.items[0] as ItemInstance).id === 1,
            );
            f.demo.command("-unequip 防具");
            check((f.demo.items[13] as ItemInstance).id === 2 && f.demo.items[89] === false);
            check(f.carriers.size === 15 && f.native.live.size === 15);
            for (const command of [
                "-drop 0",
                "-drop 91",
                "-drop 90",
                "-drop 1 2",
                "-bag-swap 1",
                "-bag-swap 1 91",
                "-bag-swap 1 1.5",
            ])
                check(f.demo.command(command)![0] !== "已丟棄物品。");
            check(f.demo.command("-items")!.some((text) => text.includes("格子 14")));
            f.carriers.destroy();
        },
    },
    {
        name: "讀檔先刪除全部舊載體，地面物品也移除，再建立新載體",
        run() {
            const f = example();
            f.demo.command("-item-new 訓練短劍");
            f.demo.command("-drop 1");
            const old = [...f.native.live.keys()];
            f.native.actions.length = 0;
            f.demo.restore(
                saveFixture().hero,
                saveFixture().worn,
                createBag([false, inventoryItem(88)]),
            );
            check(
                old.every(
                    (handle) => f.native.removed.includes(handle) && !f.native.live.has(handle),
                ),
            );
            check(
                f.native.actions.slice(0, 3).every((action) => action === "移除") &&
                    f.native.actions[3] === "建立",
            );
            check(f.demo.items[0] === false && (f.demo.items[1] as ItemInstance).id === 3);
            check(f.carriers.get(3) === f.demo.items[1] && f.native.live.size === 3);
            f.demo.command("-item-new 訓練短劍");
            check((f.demo.items[0] as ItemInstance).id === 4);
            f.carriers.remove(4);
            check(f.carriers.get(4) === undefined && f.native.live.size === 3);
            f.carriers.destroy();
            f.carriers.destroy();
            check(f.native.live.size === 0);
        },
    },
    {
        name: "載體建立失敗不留 handle 或登錄，讀檔失敗清除物品資料",
        run() {
            const f = example();
            f.native.failCreate();
            rejects(() => {
                f.demo.command("-item-new 訓練短劍");
            });
            check(
                f.native.live.size === 2 &&
                    f.carriers.size === 2 &&
                    f.demo.items.every((item) => item === false),
            );
            f.native.failCreate(2);
            rejects(() => {
                const snapshot = saveFixture(true);
                f.demo.restore(snapshot.hero, snapshot.worn, snapshot.held);
            });
            check(
                f.native.live.size === 0 &&
                    f.carriers.size === 0 &&
                    f.demo.items.every((item) => item === false) &&
                    f.demo.equipment[EquipSlot.MainHand] === undefined,
            );
            f.carriers.destroy();
            const broken = fakeItemCarriers();
            broken.failUserData();
            const registry = new NativeItemRegistry(
                broken.natives,
                {} as unit,
                () => true,
                () => {},
            );
            rejects(() => registry.add(inventoryItem()));
            check(broken.live.size === 0 && registry.size === 0);
            registry.destroy();
        },
    },
    {
        name: "登錄拒絕重複、越界編號與未知基底，不移除未登錄拾取物",
        run() {
            const native = fakeItemCarriers();
            const registry = new NativeItemRegistry(
                native.natives,
                {} as unit,
                () => true,
                () => {},
            );
            registry.add(inventoryItem());
            rejects(() => registry.add(inventoryItem()));
            for (const id of [0, -1, 1.5, 16777216]) rejects(() => registry.add(inventoryItem(id)));
            rejects(() => registry.add({ ...inventoryItem(2), baseId: "未知" }));
            const unknown = native.natives.createItem("ratf", 0, 0)!;
            native.pickup(unknown);
            check(native.live.get(unknown)!.carried && native.actions.length === 0);
            registry.remove(99);
            check(!registry.drop(99));
            registry.destroy();
            native.natives.removeItem(unknown);
            check(native.live.size === 0);
        },
    },
];
const invalidRecords: { name: string; mutate: (this: void, data: SaveData) => void }[] = [
    {
        name: "重複格子",
        mutate: (data) => {
            rows(data).push({ ...rows(data)[0] });
        },
    },
    {
        name: "格子94",
        mutate: (data) => {
            rows(data)[0].slot = 94;
        },
    },
    {
        name: "負格子",
        mutate: (data) => {
            rows(data)[0].slot = -1;
        },
    },
    {
        name: "格子小數",
        mutate: (data) => {
            rows(data)[0].slot = 1.5;
        },
    },
    {
        name: "穿戴位置不符",
        mutate: (data) => {
            rows(data)[0].slot = 2;
            rows(data).pop();
        },
    },
    {
        name: "不存在的基底",
        mutate: (data) => {
            rows(data)[0].base = 63;
        },
    },
    {
        name: "空基底",
        mutate: (data) => {
            rows(data)[0].base = 0;
        },
    },
    {
        name: "缺詞綴",
        mutate: (data) => {
            rows(data)[0].affixIds = [];
        },
    },
    {
        name: "額外詞綴",
        mutate: (data) => {
            (rows(data)[0].affixIds as number[]).push(1);
        },
    },
    {
        name: "空詞綴",
        mutate: (data) => {
            rows(data)[0].affixIds = [0];
        },
    },
    {
        name: "未知詞綴",
        mutate: (data) => {
            rows(data)[0].affixIds = [31];
        },
    },
    {
        name: "詞綴值越界",
        mutate: (data) => {
            rows(data)[0].affixValues = [63];
        },
    },
    {
        name: "沒有英雄卻有物品",
        mutate: (data) => {
            data.hero = encodeHeroSave()!.hero;
        },
    },
    {
        name: "缺知識",
        mutate: (data) => {
            const full = encodeHeroSave(saveFixture(true))!;
            data.equipment = full.equipment;
            data.hero.knowledge = Array.from({ length: 32 }, () => 0);
        },
    },
    {
        name: "重複詞綴",
        mutate: (data) => {
            const record = rows(data)[0];
            record.tier = 1;
            record.affixIds = [1, 1];
            record.affixValues = [1, 1];
        },
    },
    {
        name: "基底詞綴不相容",
        mutate: (data) => {
            const records = rows(data);
            records[1].affixIds = records[0].affixIds;
            records[1].affixValues = records[0].affixValues;
        },
    },
];
for (const entry of invalidRecords) {
    const current = entry;
    inventoryCases.push({
        name: `版本四解碼拒絕${current.name}`,
        run() {
            const data = inventoryData();
            current.mutate(data);
            check(decodeHeroSave(data) === undefined);
        },
    });
}
inventoryCases.push({
    name: "版本四參與者先全驗證才讀檔，失敗不套用英雄或範例",
    run() {
        const examples: HeroExample[] = [];
        const setup = setupSave(undefined, (player) => {
            const combat = combatFixture();
            const demo = new HeroExample(
                combat.registry,
                combat.hero,
                (low) => low,
                () => {},
            );
            examples.push(demo);
            return createHeroSaveParticipants(player, demo);
        });
        try {
            setup.command("-save");
            setup.command("-save-demo gold 99");
            examples.forEach((demo) => demo.command("-hero-up"));
            const codec = createDemoCodec(createHeroSaveParticipants(setup.network.players[0]));
            const data = inventoryData();
            rows(data).push({ ...rows(data)[0] });
            const code = codec.encode(data, setup.names.get(setup.network.players[0])!)!;
            setup.command(`-load ${code}`);
            check(examples.every((demo) => demo.hero.classes[0].level === 2));
            check(
                setup.services.every(
                    (service) => service.states.get(setup.network.players[0])!.demo.gold === 99,
                ),
            );
            setup.command("-load");
            setup.network.flush();
            check(examples.every((demo) => demo.hero.classes[0].level === 1));
            check(
                setup.services.every(
                    (service) => service.states.get(setup.network.players[0])!.demo.gold === 0,
                ),
            );
        } catch (error) {
            setup.close();
            throw error;
        }
        setup.close();
    },
});
export function verifyInventory(): number {
    for (const entry of inventoryCases) {
        try {
            entry.run();
        } catch (error) {
            throw new Error(`${entry.name}。${(error as { message: string }).message}`);
        }
    }
    return inventoryCases.length;
}
