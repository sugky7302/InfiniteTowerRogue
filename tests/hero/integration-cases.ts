import { runeScholar, ClassId, levelUp, combatLevel } from "@entities/character";
import {
    deriveCombatStats,
    combatAdd,
    combatMultiply,
    combatNumber,
    DamageKind,
    DamageOutput,
    DamageHistory,
    DefenseChannel,
    DamageStat,
    settleDamage,
} from "@entities/combat";
import {
    createItem,
    itemBases,
    ItemBaseId,
    ItemInstance,
    ItemTier,
    AffixId,
    getAffixRange,
    EquipSlot,
} from "@entities/item";
import { aggregateEquipment, emptyEquipment, equip, compareEquipment } from "@features/equipment";
import { ordinaryAttack, TacticalPause } from "@features/combat";
import { HeroExample } from "../../src/app/hero-example";
import { combatFixture } from "../combat/integration-cases";
import { setupSkill } from "../skill/setup";

function check(value: boolean): void {
    if (!value) throw new Error("H4 案例結果錯誤。");
}
function near(actual: number, expected: number): void {
    if (!Number.isFinite(actual) || Math.abs(actual - expected) >= 0.0001)
        throw new Error(`實際值 ${actual}，預期值 ${expected}。`);
}
function rejects(run: (this: void) => void): void {
    let rejected = false;
    try {
        run();
    } catch {
        rejected = true;
    }
    check(rejected);
}
function saved(id: number, baseId: ItemBaseId, affixId: AffixId, value: number): ItemInstance {
    return { id, baseId, tier: ItemTier.Common, affixes: [{ affixId, value }] };
}
function wearing(...items: ItemInstance[]) {
    let state = emptyEquipment();
    for (const item of items) {
        const result = equip(runeScholar, state, item);
        check(result.ok);
        if (result.ok) state = result.state;
    }
    return state;
}
function example(hero = runeScholar) {
    const f = combatFixture();
    let changes = 0;
    const demo = new HeroExample(
        f.registry,
        f.hero,
        (low) => low,
        () => {
            changes++;
        },
        hero,
    );
    return { ...f, demo, changes: () => changes };
}
function attack(f: ReturnType<typeof combatFixture>) {
    return ordinaryAttack(f.registry, f.hero, f.enemy, () => ({
        distance: 100,
        attackRange: 100,
        attackerCollision: 16,
        targetCollision: 16,
        tolerance: 32,
    }));
}
export const heroCases: { name: string; run(this: void): void }[] = [];
for (const entry of itemBases) {
    const base = entry;
    for (const bound of ["low", "high"] as const) {
        const edge = bound;
        heroCases.push({
            name: `${base.name}普通階${edge === "low" ? "下界" : "上界"}抽取`,
            run() {
                let calls = 0;
                const item = createItem(1, base.id, (low, high) => {
                    calls++;
                    return edge === "low" ? low : high;
                });
                check(item.tier === ItemTier.Common && item.affixes.length === 1 && calls === 2);
                const affix = item.affixes[0];
                const range = getAffixRange(affix.affixId, item.tier);
                check(affix.value === range[edge === "low" ? 0 : 1]);
            },
        });
    }
}
heroCases.push({
    name: "普通階每個詞綴池與區間中的整數都可抽取",
    run() {
        for (const base of itemBases) {
            for (let index = 0; index < base.affixPool.length; index++) {
                const position = index;
                const entry = base.affixPool[position];
                const range = getAffixRange(entry.affixId, ItemTier.Common);
                for (let value = range[0]; value <= range[1]; value++) {
                    const selected = value;
                    let call = 0;
                    const item = createItem(1, base.id, () =>
                        ++call === 1 ? position + 1 : selected,
                    );
                    check(
                        item.affixes.length === 1 &&
                            item.affixes[0].affixId === entry.affixId &&
                            item.affixes[0].value === selected,
                    );
                }
            }
        }
    },
});
heroCases.push(
    {
        name: "未穿裝備的一級英雄保持既有數值",
        run() {
            const s = aggregateEquipment(runeScholar, emptyEquipment());
            near(s.stats.maxLife, 42);
            near(s.stats.meleeAttack, 8);
            near(s.stats.spellPower, 41);
            near(s.stats.physicalDefense, 2);
            near(s.stats.spellDefense, 18);
            near(s.stats.attackSpeed, 0.2);
            check(s.mainWeapon === undefined && s.mainWeaponDamage === 0);
        },
    },
    {
        name: "正式生命公式含加值百分比與末端固定值",
        run() {
            const s = deriveCombatStats(
                { ...runeScholar.attributes, level: 1 },
                { maxLife: 8, maxLifePercent: 0.1, maxLifeFixed: 3, spellPower: 4 },
            );
            near(s.maxLife, 58);
            near(s.spellPower, 45);
        },
    },
    {
        name: "正式生命公式套用上下限",
        run() {
            near(
                deriveCombatStats({ ...runeScholar.attributes, level: 1 }, { maxLife: -100 })
                    .maxLife,
                1,
            );
            near(
                deriveCombatStats({ ...runeScholar.attributes, level: 1 }, { maxLife: 100000 })
                    .maxLife,
                100000,
            );
        },
    },
    {
        name: "升級生命從42到44且智力從16到17",
        run() {
            const result = levelUp(runeScholar, ClassId.RuneApprentice);
            check(result.ok);
            if (!result.ok) return;
            check(combatLevel(result.hero) === 2 && result.hero.attributes.intelligence === 17);
            near(aggregateEquipment(result.hero, emptyEquipment()).stats.maxLife, 44);
        },
    },
    {
        name: "起始穿新裝備且持有清單為空",
        run() {
            const f = example();
            check(f.demo.items.every((item) => item === false));
            check(f.demo.equipment[EquipSlot.MainHand]?.baseId === ItemBaseId.RuneStaff);
            check(f.demo.equipment[EquipSlot.Armor]?.baseId === ItemBaseId.ApprenticeRobe);
            check(f.demo.equipment[EquipSlot.MainHand]!.affixes.length === 1 && f.changes() === 1);
            near(f.registry.caster(f.hero).spellPower, 43);
        },
    },
    {
        name: "生命上限增加補差值且減少保留既有傷勢",
        run() {
            const f = example();
            f.demo.command("-unequip 防具");
            f.registry.setLife(f.hero, 20, 3);
            f.demo.command("-hero-up");
            near(f.registry.require(f.hero).life.life, 22);
            near(f.registry.require(f.hero).life.maxLife, 44);
            f.demo.command("-equip 2");
            near(f.registry.require(f.hero).life.life, 30);
            f.demo.command("-unequip armor");
            near(f.registry.require(f.hero).life.life, 30);
            near(f.read(f.hero).maximum, 44);
            near(f.registry.require(f.hero).life.shield, 3);
        },
    },
    {
        name: "失能時升級穿脫仍為0復起使用新上限",
        run() {
            const f = example();
            f.registry.setLife(f.hero, 0, 0);
            f.demo.command("-hero-up");
            f.demo.command("-unequip 防具");
            check(f.registry.require(f.hero).life.incapacitated);
            near(f.registry.require(f.hero).life.life, 0);
            near(f.read(f.hero).displayed, 1);
            f.registry.revive(f.hero);
            near(f.registry.require(f.hero).life.life, 44);
        },
    },
    {
        name: "持有上限與滿載卸下不改狀態",
        run() {
            const f = example();
            for (let i = 0; i < 90; i++) f.demo.command("-item-new training-sword");
            check(f.demo.items.filter((item) => item !== false).length === 90);
            check(f.demo.command("-item-new 符文杖")![0].includes("已滿"));
            check(f.demo.command("-unequip 主武器")![0].includes("已滿"));
            check(f.demo.equipment[EquipSlot.MainHand]?.id === 1);
            f.demo.command("-equip 3");
            check(
                f.demo.items.filter((item) => item !== false).length === 90 &&
                    f.demo.items.some((item) => item !== false && item.id === 1),
            );
        },
    },
    {
        name: "雙手占用失敗與替換回收原物品",
        run() {
            const f = example();
            f.demo.command("-item-new 術式手冊");
            f.demo.command("-equip 3");
            f.demo.command("-item-new 巡檢長槌");
            check(f.demo.command("-equip 4")![0].includes("副手已占用"));
            check(f.demo.items.some((item) => item !== false && item.id === 4));
            f.demo.command("-unequip 副手");
            f.demo.command("-equip 4");
            check(f.demo.items.some((item) => item !== false && item.id === 1));
            check(f.registry.require(f.hero).profile.weapon?.base === 6);
            check(f.demo.command("-equip 3")![0].includes("雙手武器"));
        },
    },
    {
        name: "聊天同時回報雙手占用與缺少知識",
        run() {
            const f = example({ ...runeScholar, knowledge: [] });
            f.demo.command("-item-new 巡檢長槌");
            f.demo.command("-equip 3");
            f.demo.command("-item-new 術式手冊");
            const messages = f.demo.command("-equip 4")!;
            check(messages.length === 2 && messages[1].includes("缺少知識：魔法解析"));
            check(f.demo.equipment[EquipSlot.OffHand] === undefined);
        },
    },
    {
        name: "沒有武器時不擲骰不造成傷害且顯示原因",
        run() {
            const f = example();
            f.demo.command("-unequip 主武器");
            const life = f.registry.require(f.enemy).life.life;
            f.operations.length = 0;
            check(attack(f) === "unarmed");
            check(f.operations.length === 0 && f.messages.includes("沒有武器"));
            near(f.registry.require(f.enemy).life.life, life);
            f.demo.command("-equip 1");
            check(attack(f) === "hit");
            check(f.registry.require(f.enemy).life.life < life);
        },
    },
    {
        name: "沒有武器時拒絕原生攻擊命令",
        run() {
            const f = example();
            const pause = new TacticalPause(f.registry, f.clock);
            f.demo.command("-unequip 主武器");
            pause.order(f.order(f.hero, "target", 851983));
            check(f.messages.includes("沒有武器") && f.operations.includes("停止"));
            pause.owner.unsubscribe();
        },
    },
    {
        name: "沒有武器時拒絕右鍵敵人但保留友軍跟隨",
        run() {
            const f = example();
            const pause = new TacticalPause(f.registry, f.clock);
            f.demo.command("-unequip 主武器");
            pause.order(f.order(f.hero, "target", 851971));
            check(f.messages.includes("沒有武器"));
            const stops = f.operations.length;
            pause.order({ ...f.order(f.hero, "target", 851971), target: f.hero });
            check(f.operations.length === stops);
            pause.owner.unsubscribe();
        },
    },
    {
        name: "暫停中卸下武器不重播舊攻擊命令",
        run() {
            const f = example();
            const pause = new TacticalPause(f.registry, f.clock);
            f.clock.pause();
            pause.order(f.order(f.hero, "target", 851983));
            f.demo.command("-unequip 主武器");
            f.clock.resume();
            f.driver.advance(0);
            check(f.replayed.length === 0);
            pause.owner.unsubscribe();
        },
    },
    {
        name: "主武器替換改用長槌基礎值與係數",
        run() {
            const f = example();
            f.demo.command("-item-new 巡檢長槌");
            f.demo.command("-equip 3");
            near(f.registry.require(f.hero).profile.weapon!.coefficient, 0.75);
            const before = f.registry.require(f.enemy).life.life;
            attack(f);
            near(before - f.registry.require(f.enemy).life.life, (13.5 * 100) / 122);
        },
    },
    {
        name: "分類暴擊加成只加入一次且不影響其他分類",
        run() {
            const f = combatFixture();
            const s = aggregateEquipment(
                runeScholar,
                wearing(saved(1, ItemBaseId.TrainingSword, AffixId.MeleeCritChance, 5)),
            );
            f.registry.update(
                f.hero,
                { ...f.registry.require(f.hero).profile, weapon: s.mainWeapon },
                s.stats,
                s.damageModifiers,
            );
            for (const output of [DamageOutput.Melee, DamageOutput.Spell]) {
                let observed = 0;
                settleDamage({
                    event: {
                        source: f.hero,
                        target: f.enemy,
                        kind: DamageKind.Direct,
                        output,
                        canCrit: true,
                        parts: [
                            {
                                amount: 10,
                                tags: ["physical"],
                                channel: DefenseChannel.Physical,
                                history: DamageHistory.Base,
                            },
                        ],
                    },
                    attacker: f.registry.attacker(f.hero),
                    target: { life: 1000, maxLife: 1000 },
                    roll: (kind, chance) => {
                        if (kind === "crit") observed = chance;
                        return false;
                    },
                });
                near(observed, output === DamageOutput.Melee ? 0.12 : 0.07);
            }
        },
    },
    {
        name: "裝備攻擊與承傷修正進入登錄快照",
        run() {
            const f = combatFixture();
            const s = aggregateEquipment(
                runeScholar,
                wearing(
                    saved(1, ItemBaseId.RuneStaff, AffixId.FireDamage, 5),
                    saved(2, ItemBaseId.ApprenticeRobe, AffixId.FireResistance, 5),
                ),
            );
            f.registry.update(
                f.hero,
                { ...f.registry.require(f.hero).profile, weapon: s.mainWeapon },
                s.stats,
                s.damageModifiers,
            );
            check(
                f.registry
                    .attacker(f.hero)
                    .modifiers!.some((m) => m.stat === DamageStat.Increase && m.value === 0.05),
            );
            check(
                f.registry
                    .target(f.hero)
                    .modifiers!.some((m) => m.stat === DamageStat.Resistance && m.value === 0.05),
            );
            near(f.registry.target(f.hero).spellDefense!, 22);
        },
    },
    {
        name: "比較不改狀態並提供完整生命公式差異",
        run() {
            const state = wearing(saved(1, ItemBaseId.ApprenticeRobe, AffixId.MaxLife, 8));
            const result = compareEquipment(
                runeScholar,
                state,
                saved(2, ItemBaseId.ApprenticeRobe, AffixId.MaxLifePercent, 5),
            );
            check(result.ok && state[EquipSlot.Armor]!.id === 1);
            if (result.ok) near(result.delta.maxLife, -5.9);
        },
    },
    {
        name: "聊天格式錯誤與未知指令不改狀態",
        run() {
            const f = example();
            for (const command of [
                "-item-new 不存在",
                "-item-new",
                "-equip 1.5",
                "-equip 1",
                "-equip",
                "-unequip 不存在",
            ])
                check(f.demo.command(command)!.length > 0);
            check(
                f.demo.command("-save") === undefined &&
                    f.demo.items.every((item) => item === false),
            );
            check(f.demo.command("-hero")!.some((text) => text.includes("戰鬥等級 1")));
            check(f.demo.command("-items")!.some((text) => text.includes("背包 0／90")));
        },
    },
    {
        name: "聊天升級到5級後保持原狀態",
        run() {
            const f = example();
            for (let i = 0; i < 4; i++) f.demo.command("-hero-up");
            const before = f.demo.hero;
            check(f.demo.command("-hero-up")![0].includes("最高等級"));
            check(f.demo.hero === before);
        },
    },
    {
        name: "32位元加法乘法與取整邊界拒絕溢位",
        run() {
            near(combatNumber(2147483520), 2147483520);
            rejects(() => combatAdd(2147483520, 1));
            rejects(() => combatMultiply(1073741761, 2));
            rejects(() =>
                aggregateEquipment(
                    {
                        ...runeScholar,
                        attributes: { ...runeScholar.attributes, intelligence: 2147483520 },
                    },
                    emptyEquipment(),
                ),
            );
            rejects(() => aggregateEquipment(runeScholar, emptyEquipment(), () => 2147483648));
        },
    },
);

for (const mode of ["baseline", "level", "intelligence", "power", "frost"] as const) {
    const variant = mode;
    heroCases.push({
        name: `技能讀取目前英雄快照：${variant === "baseline" ? "初始值" : variant === "level" ? "升級" : variant === "intelligence" ? "智力" : variant === "power" ? "法術強度" : "詞綴傷害"}`,
        run() {
            const f = combatFixture(),
                s = setupSkill();
            f.create("player", s.caster);
            f.create("enemy", s.target);
            let hero = runeScholar;
            if (variant === "level") {
                const result = levelUp(hero, ClassId.RuneApprentice);
                if (result.ok) hero = result.hero;
            }
            if (variant === "intelligence")
                hero = { ...hero, attributes: { ...hero.attributes, intelligence: 25 } };
            const state =
                variant === "power"
                    ? wearing(saved(1, ItemBaseId.RuneStaff, AffixId.SpellPower, 4))
                    : variant === "frost"
                      ? wearing(saved(1, ItemBaseId.RuneStaff, AffixId.FrostDamage, 5))
                      : emptyEquipment();
            const summary = aggregateEquipment(hero, state);
            f.registry.update(
                s.caster,
                {
                    ...f.registry.require(s.caster).profile,
                    ...summary.attributes,
                    weapon: summary.mainWeapon,
                },
                summary.stats,
                summary.damageModifiers,
            );
            s.natives.caster = () => f.registry.caster(s.caster);
            const stats = s.natives as import("@entities/combat").CombatStats;
            stats.damageTarget = (target) => f.registry.target(target);
            stats.damageAttacker = (source) => f.registry.attacker(source);
            stats.challenge = (target) => f.registry.require(target).profile.challenge;
            stats.evasion = (target) => f.registry.require(target).stats.evasion;
            stats.commitDamage = (source, target, result) =>
                f.registry.commit(source, target, result);
            const before = f.registry.require(s.target).life.life;
            try {
                s.cast();
                s.driver.advance(1.75);
                s.timer.fire(16);
                const expectedPower =
                    variant === "level"
                        ? 43
                        : variant === "intelligence"
                          ? 59
                          : variant === "power"
                            ? 45
                            : 41;
                near(
                    before - f.registry.require(s.target).life.life,
                    ((10 + expectedPower * 0.8) * (variant === "frost" ? 1.05 : 1) * 100) / 108,
                );
                check(
                    s.natives.messages.some((text) =>
                        text.includes(
                            `檢定值 ${variant === "level" || variant === "intelligence" ? 4 : 5}`,
                        ),
                    ),
                );
                check(s.natives.mana(s.caster) === 69 && s.natives.regen(s.caster) === 2);
            } catch (error) {
                s.runtime.owner.unsubscribe();
                throw error;
            }
            s.runtime.owner.unsubscribe();
        },
    });
}
export function verifyHero(): number {
    for (const item of heroCases) {
        try {
            item.run();
        } catch (error) {
            const message =
                typeof error === "string"
                    ? error
                    : ((error as { message?: string }).message ?? "未知錯誤。");
            throw new Error(`${item.name}。${message}`);
        }
    }
    return heroCases.length;
}
