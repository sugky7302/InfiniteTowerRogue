import { logger } from "@shared/logger";
import { Subscription } from "../core/subscription";
import { filter } from "../operators/filter";
import { switchMap } from "../operators/switch-map";
import { takeUntil } from "../operators/take-until";
import { tap } from "../operators/tap";
import { uiClock, worldClock } from "../scheduler/clocks";
import { Phase } from "../scheduler/phase";
import { interval } from "../sources/interval";
import { timer } from "../sources/timer";
import { onDamaged, onDamaging, onPlayerChat, onSpellChannel, onSpellEndCast } from "./events";
import { installShieldExample, whenCastCompleted } from "./m5-logic";
import { installWc3ClockDrivers } from "./wc3-clock-driver";

// 全部訂閱、排程、命令與 Signal 都在共同流程執行。沒有本地玩家分支。
export function runM5Example(): void {
    const owner = new Subscription();
    const units: unit[] = [];
    let pauseCount = 0;
    const cleanup = (): void => {
        // 只釋放本範例持有的暫停，不解除其他系統持有的暫停。
        while (pauseCount > 0) {
            worldClock.resume();
            pauseCount--;
        }
        while (units.length > 0) {
            const unit = units.pop()!;
            PauseUnit(unit, false);
            RemoveUnit(unit);
        }
    };
    try {
        installWc3ClockDrivers();
        const create = (type: string, x: number, y: number, player: player): unit => {
            const unit = CreateUnit(player, FourCC(type), x, y, 270);
            if (unit === undefined) throw new Error("M5 無法建立範例單位。");
            units.push(unit);
            SetUnitAcquireRange(unit, 0);
            return unit;
        };
        const hero = create("Hamg", -350, 450, Player(0)!);
        // 首領由玩家 0 控制，避免中立敵人的 AI 自動取消示範施法。
        const boss = create("Hamg", 350, 450, Player(0)!);
        BlzSetUnitName(hero, "M5 英雄");
        BlzSetUnitName(boss, "M5 首領");
        const target = create("hfoo", 0, 450, Player(PLAYER_NEUTRAL_PASSIVE)!);
        BlzSetUnitName(target, "M5 護盾目標");
        BlzSetUnitMaxHP(target, 100000);
        SetWidgetLife(target, 100000);
        BlzSetUnitArmor(target, 0);
        const shield = installShieldExample(
            owner,
            onDamaging
                .ofTarget(target)
                .pipe(filter((event) => event.source === hero || event.source === boss)),
            (message) => logger.info(message),
        );
        owner.add(
            onDamaged
                .ofTarget(target)
                .pipe(filter((event) => event.amount > 0))
                .subscribe((event) => {
                    logger.info(`M5 傷害後：${event.amount}，護盾 ${shield.shield()}`);
                }),
        );

        const abilityId = FourCC("AHbz");
        const cast = (caster: unit, name: string): void => {
            if (worldClock.isPaused()) {
                logger.info("M5 世界暫停中，請先恢復再下達施法指令。");
                return;
            }
            IssueImmediateOrder(caster, "stop");
            SetUnitState(caster, UNIT_STATE_MANA, 1000);
            BlzEndUnitAbilityCooldown(caster, abilityId);
            logger.info(`M5 ${name}施法命令成功：${IssuePointOrder(caster, "blizzard", 0, 450)}`);
        };
        const setupCaster = (caster: unit, name: string, delay: number): void => {
            UnitAddAbility(caster, abilityId);
            SetUnitAbilityLevel(caster, abilityId, 1);
            const ability = BlzGetUnitAbility(caster, abilityId);
            // 暴風雪只提供可中斷的原生引導。真正傷害由預告完成後的範例邏輯執行。
            if (
                ability === undefined ||
                !BlzSetAbilityRealLevelField(ability, ABILITY_RLF_DAMAGE_HBZ2, 0, 0) ||
                !BlzSetAbilityRealLevelField(ability, ABILITY_RLF_DAMAGE_PER_SECOND_HBZ5, 0, 0)
            ) {
                throw new Error("M5 無法停用暴風雪的原生傷害。");
            }
            let phase = "待命";
            let warning: effect | undefined;
            const clearWarning = (): void => {
                if (warning !== undefined) {
                    DestroyEffect(warning);
                    warning = undefined;
                }
            };
            owner.add(clearWarning);
            const channel = onSpellChannel
                .of(caster)
                .pipe(filter((event) => event.abilityId === abilityId));
            owner.add(
                onSpellEndCast
                    .of(caster)
                    .pipe(filter((event) => event.abilityId === abilityId))
                    .subscribe(() => {
                        clearWarning();
                        if (!owner.closed && phase !== "待命") {
                            logger.info(
                                `M5 ${name}${phase === "準備" ? "準備中斷，沒有作用" : "收招中斷"}，世界 ${worldClock.now()}`,
                            );
                        }
                        phase = "待命";
                    }),
            );
            owner.add(
                channel
                    .pipe(
                        tap(() => {
                            phase = "準備";
                            clearWarning();
                            warning = AddSpecialEffect(
                                "Abilities\\Spells\\Other\\TalkToMe\\TalkToMe.mdl",
                                0,
                                450,
                            );
                            logger.info(
                                `M5 ${name}準備：預告 ${delay} 秒，世界 ${worldClock.now()}`,
                            );
                        }),
                        whenCastCompleted(caster, delay),
                        tap((event) => {
                            clearWarning();
                            phase = "收招";
                            logger.info(`M5 ${name}作用：傷害 40，世界 ${worldClock.now()}`);
                            const impact = AddSpecialEffect(
                                "Abilities\\Spells\\Human\\ThunderClap\\ThunderClapCaster.mdl",
                                event.targetX,
                                event.targetY,
                            );
                            if (impact !== undefined) DestroyEffect(impact);
                            UnitDamageTarget(
                                caster,
                                target,
                                40,
                                false,
                                false,
                                ATTACK_TYPE_CHAOS,
                                DAMAGE_TYPE_UNIVERSAL,
                                WEAPON_TYPE_WHOKNOWS,
                            );
                            logger.info(`M5 ${name}收招：0.4 秒，世界 ${worldClock.now()}`);
                        }),
                        switchMap(() =>
                            timer(0.4, { phase: Phase.Combat }).pipe(
                                takeUntil(onSpellEndCast.of(caster)),
                            ),
                        ),
                    )
                    .subscribe(() => {
                        phase = "待命";
                        logger.info(`M5 ${name}收招完成，世界 ${worldClock.now()}`);
                        IssueImmediateOrder(caster, "stop");
                    }),
            );
        };
        setupCaster(hero, "英雄", 0.8);
        setupCaster(boss, "首領", 1.5);

        owner.add(timer(2, { phase: Phase.Combat }).subscribe(() => cast(hero, "英雄")));
        owner.add(timer(5, { phase: Phase.Combat }).subscribe(() => cast(boss, "首領")));
        owner.add(timer(9, { phase: Phase.Combat }).subscribe(() => cast(hero, "英雄")));
        owner.add(
            timer(9.2, { phase: Phase.Combat }).subscribe(() => {
                logger.info(`M5 自動中斷英雄，世界 ${worldClock.now()}`);
                IssueImmediateOrder(hero, "stop");
            }),
        );
        owner.add(
            interval(1, { clock: uiClock }).subscribe(() =>
                logger.info(
                    `M5 狀態：介面 ${uiClock.now()}，世界 ${worldClock.now()}，暫停次數 ${pauseCount}`,
                ),
            ),
        );
        owner.add(
            onPlayerChat.subscribe((event) => {
                switch (event.message) {
                    case "-pause":
                        if (pauseCount === 2147483647) {
                            logger.warn("M5 暫停次數已達上限。");
                            return;
                        }
                        worldClock.pause();
                        pauseCount++;
                        // 單位暫停由戰鬥層處理，不是 RxWC3 世界時鐘的職責。
                        for (const unit of units) PauseUnit(unit, true);
                        logger.info(`M5 暫停：世界 ${worldClock.now()}，暫停次數 ${pauseCount}`);
                        break;
                    case "-resume":
                        if (pauseCount > 0) {
                            worldClock.resume();
                            pauseCount--;
                        }
                        if (!worldClock.isPaused())
                            for (const unit of units) PauseUnit(unit, false);
                        logger.info(
                            `M5 恢復：世界 ${worldClock.now()}，暫停次數 ${pauseCount}，世界仍暫停 ${worldClock.isPaused()}`,
                        );
                        break;
                    case "-m5-cast":
                        cast(hero, "英雄");
                        break;
                    case "-m5-boss":
                        cast(boss, "首領");
                        break;
                    case "-m5-stop":
                        owner.unsubscribe();
                        logger.info("M5 已取消全部訂閱與副作用，並清理範例單位及效果。");
                        break;
                }
            }),
        );
        // 先取消事件與任務，再移除單位。初始化失敗時也把清理加入同一個擁有者。
        owner.add(cleanup);
        logger.info(
            "M5 已啟動，護盾 100。第 2、5、9 秒自動施法。指令：-pause、-resume、-m5-cast、-m5-boss、-m5-stop。",
        );
    } catch (error) {
        owner.add(cleanup);
        owner.unsubscribe();
        logger.error(error);
    }
}
