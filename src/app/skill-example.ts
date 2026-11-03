import { logger } from "@shared/logger";
import {
    frames,
    installWc3ClockDrivers,
    onPlayerChat,
    onSpellChannel,
    onSpellEndCast,
    onUnitOrder,
    Subscription,
    worldClock,
} from "@shared/rxwc3";
import { scholar } from "@entities/character";
import { displayNumber, manaCapacity } from "@entities/combat";
import { installPauseBridge } from "@features/combat";
import { skills, SkillRuntime } from "@features/skill";
import { createWc3SkillNatives } from "./wc3-skill-natives";

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
});

export function runSkillExample(): void {
    const owner = new Subscription();
    const listeners = new Subscription();
    const units: unit[] = [];
    let adapter: ReturnType<typeof createWc3SkillNatives> | undefined;
    let runtime: SkillRuntime | undefined;
    let bridge: Subscription | undefined;
    let pauses = 0;
    // 依序停止事件、排程及轉接，最後才移除單位與原生資源。
    owner.add(listeners);
    owner.add(() => runtime?.owner.unsubscribe());
    owner.add(() => bridge?.unsubscribe());
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
        adapter = createWc3SkillNatives();
        const hero = CreateUnit(Player(0)!, FourCC("H0SS"), 0, -160, 270)!;
        units.push(hero);
        adapter.heroes.add(hero);
        SuspendHeroXP(hero, true);
        BlzSetUnitMaxMana(hero, manaCapacity(scholar.intelligence, scholar.spirit));
        SetUnitState(hero, UNIT_STATE_MANA, manaCapacity(scholar.intelligence, scholar.spirit));
        adapter.natives.setRegen(hero, scholar.manaRegen);
        for (let index = 0; index < 4; index++) {
            const enemy = CreateUnit(
                Player(PLAYER_NEUTRAL_AGGRESSIVE)!,
                FourCC("h0SE"),
                220 + index * 140,
                -160,
                180,
            )!;
            units.push(enemy);
            adapter.enemies.add(enemy);
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
                if (event.message === "-skill-status") {
                    logger.info(
                        `世界時間 ${displayNumber(worldClock.now())}，法力 ${displayNumber(natives.mana(hero))}，恢復欄位 ${displayNumber(natives.regen(hero))}，火球冷卻 ${displayNumber(natives.cooldown(hero, FourCC("A0SF")))}`,
                    );
                    for (let index = 1; index < units.length; index++)
                        logger.info(
                            `敵人 ${index}：生命 ${displayNumber(GetWidgetLife(units[index]))}，移速 ${displayNumber(natives.speed(units[index]))}`,
                        );
                }
                if (event.message === "-skill-move") {
                    for (let index = 1; index < units.length; index++)
                        IssuePointOrder(units[index], "move", moveRight ? 900 : 200, -160);
                    moveRight = !moveRight;
                }
            }),
        );
        SelectUnit(hero, true);
        logger.info("技能範例已啟動。火球術 F，寒冰箭 I。指令：-pause、-resume、-skill-stop。");
    } catch (error) {
        owner.unsubscribe();
        logger.error(error);
    }
}
