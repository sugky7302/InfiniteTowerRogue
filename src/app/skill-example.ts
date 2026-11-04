import { logger } from "@shared/logger";
import {
    frames,
    installWc3ClockDrivers,
    onPlayerChat,
    onDamaging,
    onSpellChannel,
    onSpellEndCast,
    onUnitOrder,
    Subscription,
    worldClock,
} from "@shared/rxwc3";
import { scholar, runeScholar, combatLevel, patrolMachine } from "@entities/character";
import { displayNumber, manaCapacity } from "@entities/combat";
import { CombatRegistry, CombatRuntime, PatrolMachine, installPauseBridge } from "@features/combat";
import {
    wc3UnitActionNatives,
    wc3UnitNatives,
    wc3EffectNatives,
    wc3RandomNatives,
} from "@shared/wc3-def";
import { skills, SkillRuntime } from "@features/skill";
import { createWc3SkillNatives } from "./wc3-skill-natives";
import { HeroExample } from "./hero-example";

declare function compiletime<T>(
    this: void,
    callback: (
        this: void,
        context: { objectData: import("war3-objectdata-th/dist/cjs").ObjectData },
    ) => T,
): T;

// 相依模組先建立物件；main.ts 的既有 compiletime 回呼最後儲存全部物件。
compiletime(({ objectData }) => {
    const root = require("process").cwd();
    // 建置腳本同時讀取技能定義與角色數值。war3-transformer 執行此回呼時不支援物件展開語法。
    const definitions = Object.assign(
        {},
        require(root + "/src/features/skill/config/definitions.ts"),
        require(root + "/src/entities/character/model/roles.ts"),
    );
    require(root + "/scripts/skill-objects.cjs").createSkillObjects(objectData, definitions);
    require(root + "/scripts/combat-objects.cjs").createCombatObjects(objectData, definitions);
});

export function runSkillExample(): void {
    const owner = new Subscription();
    const listeners = new Subscription();
    const units: unit[] = [];
    let adapter: ReturnType<typeof createWc3SkillNatives> | undefined;
    let runtime: SkillRuntime | undefined;
    let bridge: Subscription | undefined;
    let combat: CombatRuntime | undefined;
    const warnings = new Map<unit, lightning[]>();
    const clearWarning = (target: unit): void => {
        for (const edge of warnings.get(target) ?? []) DestroyLightning(edge);
        warnings.delete(target);
    };
    let pauses = 0;
    // 依序停止事件、排程及轉接，最後才移除單位與原生資源。
    owner.add(listeners);
    owner.add(() => runtime?.owner.unsubscribe());
    owner.add(() => bridge?.unsubscribe());
    owner.add(() => combat?.owner.unsubscribe());
    owner.add(() => {
        while (pauses > 0) {
            pauses--;
            worldClock.resume();
        }
    });
    owner.add(() => {
        for (const target of units) RemoveUnit(target);
    });
    owner.add(() => adapter?.destroy());
    try {
        installWc3ClockDrivers();
        const registry = new CombatRegistry(
            {
                ...wc3UnitActionNatives,
                x: wc3UnitNatives.x,
                y: wc3UnitNatives.y,
                stop: wc3UnitNatives.stop,
                speed: wc3UnitNatives.speed,
                setSpeed: wc3UnitNatives.setSpeed,
                unitType: wc3UnitNatives.unitType,
                text: wc3EffectNatives.text,
                randomInt: wc3RandomNatives.randomInt,
            },
            worldClock,
        );
        combat = new CombatRuntime(
            registry,
            worldClock,
            { onDamaging, onUnitOrder },
            {
                clear: (target) => clearWarning(target),
                warning(target, machine) {
                    clearWarning(target);
                    const c = Math.cos(machine.direction),
                        s = Math.sin(machine.direction);
                    const half = machine.config.width / 2;
                    const corner = (along: number, across: number) => ({
                        x: machine.origin.x + along * c - across * s,
                        y: machine.origin.y + along * s + across * c,
                    });
                    const points = [
                        corner(0, -half),
                        corner(machine.config.length, -half),
                        corner(machine.config.length, half),
                        corner(0, half),
                    ];
                    const edges: lightning[] = [];
                    for (let index = 0; index < 4; index++) {
                        const a = points[index],
                            b = points[(index + 1) % 4];
                        const start = Location(a.x, a.y),
                            end = Location(b.x, b.y);
                        const edge = AddLightningEx(
                            "DRAL",
                            true,
                            a.x,
                            a.y,
                            GetLocationZ(start) + 8,
                            b.x,
                            b.y,
                            GetLocationZ(end) + 8,
                        )!;
                        RemoveLocation(start);
                        RemoveLocation(end);
                        SetLightningColor(edge, 1, 0.25, 0.1, 1);
                        edges.push(edge);
                    }
                    warnings.set(target, edges);
                    if (bj_questDiscoveredSound !== undefined) StartSound(bj_questDiscoveredSound);
                },
            },
        );
        adapter = createWc3SkillNatives(registry, combat.pause);
        const hero = CreateUnit(Player(0)!, FourCC("H0SS"), 0, -160, 270)!;
        units.push(hero);
        adapter.heroes.add(hero);
        registry.register(hero, "scholar", "player", {
            ...runeScholar.attributes,
            level: combatLevel(runeScholar),
            challenge: 1,
            armor: 0,
        });
        const heroExample = new HeroExample(
            registry,
            hero,
            (low, high) => GetRandomInt(low, high),
            (summary) => {
                BlzSetUnitAttackCooldown(hero, 1.5 / (1 + summary.stats.attackSpeed), 0);
            },
        );
        SuspendHeroXP(hero, true);
        BlzSetUnitMaxMana(hero, manaCapacity(scholar.intelligence, scholar.spirit));
        SetUnitState(hero, UNIT_STATE_MANA, manaCapacity(scholar.intelligence, scholar.spirit));
        adapter.natives.setRegen(hero, scholar.manaRegen);
        for (let index = 0; index < 2; index++) {
            const id = index;
            const enemy = CreateUnit(
                Player(PLAYER_NEUTRAL_AGGRESSIVE)!,
                FourCC("h0CM"),
                420 + id * 220,
                100 + id * 180,
                180,
            )!;
            units.push(enemy);
            adapter.enemies.add(enemy);
            registry.register(enemy, "machine", "enemy", patrolMachine);
            combat.trackMachine(
                enemy,
                new PatrolMachine(
                    {
                        prepareMs: Math.round(patrolMachine.prepareSeconds * 1000),
                        recoveryMs: Math.round(patrolMachine.recoverySeconds * 1000),
                        length: patrolMachine.attackShape.length,
                        width: patrolMachine.attackShape.width,
                        noticeRange: 600,
                        chaseRange: 900,
                    },
                    [
                        { x: 420 + id * 220, y: 100 + id * 180 },
                        { x: 720 + id * 220, y: 100 + id * 180 },
                    ],
                ),
            );
        }
        runtime = new SkillRuntime(adapter.natives, adapter.stats, worldClock, frames());
        runtime.track(hero, skills, { onSpellChannel, onSpellEndCast, onUnitOrder }, (code) =>
            FourCC(code),
        );
        const tracked = runtime;
        bridge = installPauseBridge(
            worldClock,
            adapter.natives,
            [hero],
            skills.map((skill) => FourCC(skill.code)),
            (unit) => tracked.isCasting(unit),
        );
        const natives = adapter.natives;
        let moveRight = true;
        listeners.add(
            onPlayerChat.subscribe((event) => {
                if (event.player !== GetOwningPlayer(hero)) return;
                try {
                    const messages = heroExample.command(event.message);
                    if (messages !== undefined) {
                        for (const message of messages) logger.info(message);
                        return;
                    }
                } catch (error) {
                    logger.error(error);
                    return;
                }
                if (event.message === "-pause") {
                    pauses++;
                    worldClock.pause();
                    logger.info("世界時鐘已暫停。");
                }
                if (event.message === "-resume" && pauses > 0) {
                    pauses--;
                    worldClock.resume();
                    logger.info("世界時鐘已恢復一次。");
                }
                if (event.message === "-skill-stop") owner.unsubscribe();
                if (event.message === "-resume" && !worldClock.isPaused()) combat!.pause.restore();
                if (event.message === "-revive") registry.revive(hero);
                if (event.message === "-skill-status") {
                    logger.info(
                        `世界時間 ${displayNumber(worldClock.now())}，法力 ${displayNumber(natives.mana(hero))}，恢復欄位 ${displayNumber(natives.regen(hero))}，火球冷卻 ${displayNumber(natives.cooldown(hero, FourCC("A0SF")))}`,
                    );
                    for (const state of registry.units.values())
                        logger.info(
                            `戰鬥者生命 ${displayNumber(state.life.life)}／${displayNumber(state.life.maxLife)}，護盾 ${displayNumber(state.life.shield)}，失能 ${state.life.incapacitated}，擊倒 ${state.life.knockedDown}`,
                        );
                }
                if (event.message === "-combat-hold") {
                    combat!.hold(!combat!.held);
                    logger.info(combat!.held ? "巡檢機停在原地。" : "巡檢機恢復行動。");
                }
                if (event.message === "-skill-move") {
                    for (let index = 1; index < units.length; index++)
                        if (registry.active(units[index]) && !worldClock.isPaused())
                            combat!.moveMachine(units[index], moveRight ? 900 : 200, -160);
                    moveRight = !moveRight;
                }
            }),
        );
        SelectUnit(hero, true);
        logger.info(
            "戰鬥範例已啟動。火球術 F，寒冰箭 I。右鍵普通攻擊。指令 -pause、-resume、-skill-status、-skill-move、-combat-hold、-revive、-skill-stop、-hero、-hero-up、-hero-forget、-item-new <基底>、-items、-equip <編號>、-unequip <位置>。",
        );
    } catch (error) {
        owner.unsubscribe();
        logger.error(error);
    }
}
