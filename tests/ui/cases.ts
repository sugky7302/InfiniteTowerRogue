import { runeScholar, ClassId, levelUp } from "@entities/character";
import { EquipSlot, ItemBaseId, ItemTier, createItem } from "@entities/item";
import {
    InventoryCell,
    InventorySelection,
    InventorySnapshot,
    InventoryTransition,
    bagPosition,
    equipmentPosition,
    inventorySlots,
    inventoryTransition,
    inventoryView,
    inventoryDescription,
    inventorySlotView,
    inventoryItemText,
    equipmentStatValue,
    inventoryNumberText,
    previewModelPath,
    createBag,
    emptyEquipment,
    aggregateEquipment,
    equip,
} from "@features/equipment";
import { HeroExample } from "../../src/app/hero-example";
import { NativeItemRegistry } from "../../src/app/native-item-registry";
import { combatFixture } from "../combat/integration-cases";
import { fakeItemCarriers } from "../inventory/fake-item-carriers";

function check(value: boolean): void {
    if (!value) throw new Error("I4 物品欄驗證失敗。");
}
function rejects(action: (this: void) => void): void {
    let failed = false;
    try {
        action();
    } catch {
        failed = true;
    }
    check(failed);
}
function fixture(full = false) {
    const bag = [...createBag()];
    if (full) {
        for (let index = 0; index < 90; index++)
            bag[index] = createItem(index + 10, ItemBaseId.TrainingSword, (low) => low);
    } else bag[0] = createItem(10, ItemBaseId.TrainingSword, (low) => low);
    return { hero: runeScholar, bag, worn: emptyEquipment() };
}
const bag = (index: number): InventoryCell => ({ kind: "bag", index });
const worn = (slot: EquipSlot): InventoryCell => ({ kind: "equipment", slot });
function click(
    snapshot: InventorySnapshot,
    first: InventoryCell,
    second: InventoryCell,
): InventoryTransition {
    const selected = inventoryTransition(snapshot, false, { kind: "click", cell: first });
    return inventoryTransition(snapshot, selected.selection, { kind: "click", cell: second });
}
function selected(snapshot: InventorySnapshot, cell: InventoryCell): InventorySelection {
    return inventoryTransition(snapshot, false, { kind: "click", cell }).selection;
}
function unchanged(snapshot: InventorySnapshot, result: InventoryTransition): void {
    check(!result.changed && result.worn === snapshot.worn && result.bag === snapshot.bag);
}
function example() {
    const f = combatFixture();
    const hero = new HeroExample(
        f.registry,
        f.hero,
        (low) => low,
        () => {},
    );
    const fake = fakeItemCarriers();
    const carriers = new NativeItemRegistry(
        fake.natives,
        f.hero,
        (item) => hero.acceptPickup(item),
        () => {},
    );
    hero.attachCarriers(carriers);
    return { hero, fake, carriers };
}
export const inventoryUiCases: { name: string; run(this: void): void }[] = [
    {
        name: "I4 全部格子依頁行列計算，座標保持在安全區域",
        run() {
            for (let index = 0; index < 90; index++) {
                const p = bagPosition(index);
                check(
                    p.page === Math.floor(index / 30) &&
                        p.row === Math.floor((index % 30) / 6) &&
                        p.column === index % 6,
                );
                check(p.x >= 0 && p.x + 0.04 <= 0.8 && p.y <= 0.6 && p.y - 0.04 >= 0.18);
                for (const value of [index, p.page, p.row, p.column])
                    check(Number.isInteger(value) && value <= 2147483647);
            }
            for (let index = 0; index < 4; index++) {
                const p = equipmentPosition(index);
                check(p.x >= 0 && p.x + 0.04 <= 0.8 && p.y <= 0.6 && p.y - 0.04 >= 0.18);
            }
        },
    },
    {
        name: "I4 拒絕無效座標與頁數",
        run() {
            for (const value of [-1, 90, 0.5]) rejects(() => bagPosition(value));
            for (const value of [-1, 4, 0.5]) rejects(() => equipmentPosition(value));
            for (const value of [-1, 3, 0.5]) rejects(() => inventoryView(fixture(), value, false));
        },
    },
    {
        name: "I4 點空格且沒有選取時不做事",
        run() {
            const s = fixture();
            const r = inventoryTransition(s, false, { kind: "click", cell: bag(1) });
            unchanged(s, r);
            check(r.selection === false && r.messages.length === 0);
        },
    },
    {
        name: "I4 點同一格取消選取",
        run() {
            const s = fixture();
            const r = click(s, bag(0), bag(0));
            unchanged(s, r);
            check(r.selection === false);
        },
    },
    {
        name: "I4 背包交換包含跨頁空格且不修改輸入",
        run() {
            const s = fixture();
            const r = click(s, bag(0), bag(89));
            check(
                r.changed &&
                    r.bag[0] === false &&
                    r.bag[89] === s.bag[0] &&
                    s.bag[0] !== false &&
                    s.bag[89] === false &&
                    r.selection === false,
            );
        },
    },
    {
        name: "I4 背包兩件物品交換",
        run() {
            const s = fixture(true);
            const r = click(s, bag(0), bag(30));
            check(r.changed && r.bag[0] === s.bag[30] && r.bag[30] === s.bag[0]);
        },
    },
    {
        name: "I4 背包到穿戴位置成功且保留輸入",
        run() {
            const s = fixture();
            const r = click(s, bag(0), worn(EquipSlot.MainHand));
            check(
                r.changed &&
                    r.worn[EquipSlot.MainHand] === s.bag[0] &&
                    r.bag[0] === false &&
                    s.worn[EquipSlot.MainHand] === undefined,
            );
        },
    },
    {
        name: "I4 滿背包替換裝備使用候選物清出的空格",
        run() {
            const s = fixture(true);
            const old = createItem(1, ItemBaseId.RuneStaff, (low) => low);
            const r = click(
                { ...s, worn: { ...s.worn, [EquipSlot.MainHand]: old } },
                bag(0),
                worn(EquipSlot.MainHand),
            );
            check(
                r.changed &&
                    r.bag[0] === old &&
                    r.bag.filter((item) => item !== false).length === 90,
            );
        },
    },
    {
        name: "I4 錯誤位置與全部缺少知識原因同時顯示且不修改狀態",
        run() {
            const s = fixture();
            s.bag[0] = createItem(10, ItemBaseId.SpellManual, (low) => low);
            const snapshot = { ...s, hero: { ...s.hero, knowledge: [] } };
            const r = click(snapshot, bag(0), worn(EquipSlot.Tool));
            unchanged(snapshot, r);
            check(
                r.messages.length >= 2 &&
                    r.messages[0].includes("位置錯誤") &&
                    r.messages.some((v) => v.includes("缺少知識")) &&
                    r.selection !== false,
            );
        },
    },
    {
        name: "I4 雙手武器與副手衝突失敗不改變狀態",
        run() {
            const s = fixture();
            s.bag[0] = createItem(10, ItemBaseId.PatrolHammer, (low) => low);
            const snapshot = {
                ...s,
                worn: {
                    ...s.worn,
                    [EquipSlot.OffHand]: createItem(2, ItemBaseId.SpellManual, (low) => low),
                },
            };
            const r = click(snapshot, bag(0), worn(EquipSlot.MainHand));
            unchanged(snapshot, r);
            check(r.messages.some((v) => v.includes("副手已占用")));
        },
    },
    {
        name: "I4 穿戴到背包使用第一個空格",
        run() {
            const s = fixture();
            const snapshot = {
                ...s,
                worn: {
                    ...s.worn,
                    [EquipSlot.Armor]: createItem(1, ItemBaseId.ApprenticeRobe, (low) => low),
                },
            };
            const r = click(snapshot, worn(EquipSlot.Armor), bag(89));
            check(
                r.changed &&
                    r.worn[EquipSlot.Armor] === undefined &&
                    r.bag[1] === snapshot.worn[EquipSlot.Armor] &&
                    r.bag[89] === false,
            );
        },
    },
    {
        name: "I4 滿背包卸下失敗且物品不遺失",
        run() {
            const s = fixture(true);
            const snapshot = {
                ...s,
                worn: {
                    ...s.worn,
                    [EquipSlot.Armor]: createItem(1, ItemBaseId.ApprenticeRobe, (low) => low),
                },
            };
            const r = click(snapshot, worn(EquipSlot.Armor), bag(89));
            unchanged(snapshot, r);
            check(r.messages.join("").includes("背包已滿") && r.selection !== false);
        },
    },
    {
        name: "I4 穿戴物不能直接移到另一穿戴位置",
        run() {
            const s = fixture();
            const snapshot = {
                ...s,
                worn: {
                    ...s.worn,
                    [EquipSlot.Armor]: createItem(1, ItemBaseId.ApprenticeRobe, (low) => low),
                },
            };
            const r = click(snapshot, worn(EquipSlot.Armor), worn(EquipSlot.Tool));
            unchanged(snapshot, r);
            check(r.messages.length === 1);
        },
    },
    {
        name: "I4 沒有選取與選穿戴物時丟棄顯示原因",
        run() {
            const s = fixture();
            const snapshot = {
                ...s,
                worn: {
                    ...s.worn,
                    [EquipSlot.Armor]: createItem(1, ItemBaseId.ApprenticeRobe, (low) => low),
                },
            };
            for (const selection of [false, selected(snapshot, worn(EquipSlot.Armor))] as const) {
                const r = inventoryTransition(snapshot, selection, { kind: "drop" });
                unchanged(snapshot, r);
                check(r.messages.length === 1 && r.dropped === undefined);
            }
        },
    },
    {
        name: "I4 丟棄結果保留載體資料供 app 先執行",
        run() {
            const s = fixture();
            const r = inventoryTransition(s, selected(s, bag(0)), { kind: "drop" });
            check(s.bag[0] !== false);
            check(r.changed && r.dropped === s.bag[0] && r.bag[0] === false);
        },
    },
    {
        name: "I4 外部物品變動使過期選取失效",
        run() {
            const s = fixture();
            const selection = selected(s, bag(0));
            s.bag[0] = false;
            const r = inventoryTransition(s, selection, {
                kind: "click",
                cell: worn(EquipSlot.MainHand),
            });
            unchanged(s, r);
            check(r.selection === false && r.messages.length === 1);
        },
    },
    {
        name: "I4 無效背包目標不改變資料",
        run() {
            const s = fixture();
            const r = inventoryTransition(s, selected(s, bag(0)), { kind: "click", cell: bag(90) });
            unchanged(s, r);
            check(r.messages.length === 1);
        },
    },
    {
        name: "I4 三頁檢視具有全部格子名稱、圖示與選取",
        run() {
            const s = fixture(true);
            const selection = selected(s, bag(30));
            for (let page = 0; page < 3; page++) {
                const view = inventoryView(s, page, selection);
                check(view.bag.length === 30 && view.worn.length === 4 && view.stats.length === 13);
                check(view.bag.filter((slot) => slot.selected).length === (page === 1 ? 1 : 0));
                check(view.bag.every((slot) => slot.name.length > 0 && slot.icon.length > 0));
            }
            const empty = fixture();
            empty.bag[0] = false;
            check(inventorySlotView(empty, bag(0), false).name === "空");
            for (const slot of inventorySlots)
                check(inventorySlotView(empty, worn(slot), false).icon.length > 0);
        },
    },
    {
        name: "I4 說明顯示名稱階級固定屬性詞綴及同位置差值",
        run() {
            const s = fixture();
            const text = inventoryDescription(s, bag(0));
            for (const part of ["訓練短劍", "普通階", "固定屬性", "詞綴", "比較：空", "差值："])
                check(text.includes(part));
            check(!text.includes("undefined") && !text.includes("nil"));
        },
    },
    {
        name: "I4 穿戴物與空格說明沒有候選差值",
        run() {
            const s = fixture();
            const snapshot = {
                ...s,
                worn: {
                    ...s.worn,
                    [EquipSlot.Armor]: createItem(1, ItemBaseId.ApprenticeRobe, (low) => low),
                },
            };
            check(!inventoryDescription(snapshot, worn(EquipSlot.Armor)).includes("差值"));
            check(
                inventoryDescription(s, bag(1)).includes("空") &&
                    inventoryDescription(s, false).length > 0,
            );
        },
    },
    {
        name: "I4 零差值明確顯示無，Lua 空字串不作預設值",
        run() {
            const s = fixture();
            const candidate = s.bag[0];
            check(candidate !== false);
            if (candidate === false) return;
            const snapshot = {
                ...s,
                worn: { ...s.worn, [EquipSlot.MainHand]: { ...candidate, id: 2 } },
            };
            check(inventoryDescription(snapshot, bag(0)).includes("差值：無"));
            check(
                inventoryItemText({ ...candidate, affixes: [] })
                    .join("")
                    .includes("詞綴：無"),
            );
        },
    },
    {
        name: "I4 不能穿上物品的說明保留全部原因",
        run() {
            const s = fixture();
            s.bag[0] = createItem(10, ItemBaseId.SpellManual, (low) => low);
            const snapshot = { ...s, hero: { ...s.hero, knowledge: [] } };
            check(inventoryDescription(snapshot, bag(0)).includes("不能穿上：缺少知識"));
        },
    },
    {
        name: "I4 百分比與零值格式正確",
        run() {
            check(inventoryNumberText(2147483520) === "2147483520");
            check(inventoryNumberText(-2147483520) === "-2147483520");
            check(inventoryNumberText(-0.01) === "0" && inventoryNumberText(1.96) === "2");
            check(inventoryNumberText(-1.24) === "-1.2");
            check(
                equipmentStatValue("critChance", 0) === "0%" &&
                    equipmentStatValue("critDamage", 2) === "200%",
            );
            check(
                equipmentStatValue("attackSpeed", 0.25) === "25%" &&
                    equipmentStatValue("maxLife", 0) === "0",
            );
            check(
                !equipmentStatValue("evasion", 5).includes("%") &&
                    !equipmentStatValue("castingStability", 5).includes("%"),
            );
        },
    },
    {
        name: "I4 穿戴與升級後二級數值立即由新狀態計算",
        run() {
            const s = fixture();
            const after = click(s, bag(0), worn(EquipSlot.MainHand));
            const a = inventoryView(s, 0, false);
            const b = inventoryView({ ...s, worn: after.worn }, 0, false);
            check(a.stats[1].value !== b.stats[1].value);
            const up = levelUp(s.hero, ClassId.RuneApprentice);
            check(up.ok);
            if (up.ok)
                check(
                    inventoryView({ ...s, hero: up.hero }, 0, false).stats[0].value !==
                        a.stats[0].value,
                );
        },
    },
    {
        name: "I4 英雄預覽只使用正面模型",
        run() {
            check(previewModelPath === "ui\\itr-hero-preview.mdl");
        },
    },
    {
        name: "I4 變更訂閱涵蓋聊天建立交換丟棄撿起升級與讀檔",
        run() {
            const f = example();
            let count = 0;
            const stop = f.hero.subscribe(() => {
                count++;
            });
            f.hero.command("-item-new 訓練短劍");
            check(count === 1);
            f.hero.command("-bag-swap 1 90");
            check(count === 2);
            const item = f.hero.items[89];
            check(item !== false);
            f.hero.command("-drop 90");
            check(count === 3);
            if (item !== false) f.fake.pickup(f.fake.byId(item.id).handle);
            check(count === 4);
            f.hero.command("-hero-up");
            check(count === 5);
            const saved = f.hero.snapshot();
            f.hero.restore(saved.hero, saved.worn, saved.held);
            check(count === 6);
            f.hero.command("-hero-forget");
            check(count === 7);
            stop();
            f.hero.command("-item-new 學徒長袍");
            check(count === 7);
            f.carriers.destroy();
        },
    },
    {
        name: "I4 面板操作經 HeroExample 接到戰鬥與載體丟棄",
        run() {
            const f = example();
            f.hero.command("-item-new 訓練短劍");
            let r = f.hero.send(false, { kind: "click", cell: bag(0) });
            r = f.hero.send(r.selection, { kind: "click", cell: worn(EquipSlot.MainHand) });
            check(
                r.changed &&
                    f.hero.equipment[EquipSlot.MainHand]?.baseId === ItemBaseId.TrainingSword,
            );
            check(
                f.hero.summary.stats.meleeAttack ===
                    aggregateEquipment(f.hero.hero, f.hero.equipment).stats.meleeAttack,
            );
            r = f.hero.send(false, { kind: "click", cell: bag(0) });
            const dropped = f.hero.send(r.selection, { kind: "drop" });
            check(
                dropped.changed &&
                    dropped.dropped !== undefined &&
                    f.fake.byId(dropped.dropped.id).visible,
            );
            f.carriers.destroy();
        },
    },
    {
        name: "I4 載體無法丟棄時保留物品與選取",
        run() {
            const f = combatFixture();
            const hero = new HeroExample(
                f.registry,
                f.hero,
                (low) => low,
                () => {},
            );
            hero.command("-item-new 訓練短劍");
            const item = hero.items[0];
            const selection = hero.send(false, { kind: "click", cell: bag(0) }).selection;
            const r = hero.send(selection, { kind: "drop" });
            check(
                !r.changed &&
                    r.selection === selection &&
                    hero.items[0] === item &&
                    r.messages[0].includes("無法丟棄"),
            );
        },
    },
];
