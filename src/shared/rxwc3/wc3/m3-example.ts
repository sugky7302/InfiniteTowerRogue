import { logger } from "@shared/logger";
import { reportUnhandledError } from "../core/config";
import { Phase } from "../scheduler/phase";
import { timer } from "../sources/timer";
import { switchMap } from "../operators/switch-map";
import { takeUntil } from "../operators/take-until";
import { onDamaging, onDamaged, onSpellChannel, onSpellCast, onSpellEffect,
  onSpellFinish, onSpellEndCast, onUnitDeath, onPlayerChat } from "./events";
import { installWc3ClockDrivers } from "./wc3-clock-driver";


// 同步測試範例：全部建立、命令、訂閱與計時都在共同地圖啟動流程執行。
export function runM3Example(): void {
  try {
    installWc3ClockDrivers();
    const player = Player(0)!;
    const enemy = Player(PLAYER_NEUTRAL_AGGRESSIVE)!;
    SetPlayerAlliance(player, enemy, ALLIANCE_PASSIVE, false);
    SetPlayerAlliance(enemy, player, ALLIANCE_PASSIVE, false);
    const first = CreateUnit(player, FourCC("hfoo"), 400, 0, 0);
    const second = CreateUnit(enemy, FourCC("hfoo"), 520, 0, 180);
    const caster = CreateUnit(player, FourCC("Hamg"), -400, 0, 0);
    if (first === undefined || second === undefined || caster === undefined) {
      throw new Error("M3 範例無法建立測試單位。");
    }
    for (const unit of [first, second]) {
      BlzSetUnitMaxHP(unit, 100);
      SetWidgetLife(unit, 100);
      BlzSetUnitArmor(unit, 0);
      onDamaging.ofTarget(unit).subscribe(event => {
        const before = event.amount;
        event.setAmount(before / 2);
        logger.info(`M3 傷害前：${before}，減半後：${event.amount}`);
      });
      onDamaging.ofTarget(unit).subscribe(event => logger.info(`M3 後續訂閱傷害量：${event.amount}`));
      onDamaged.ofTarget(unit).subscribe(event => logger.info(`M3 最終傷害：${event.amount}`));
      onUnitDeath.of(unit).subscribe(event => logger.info(
        `M3 死亡：${GetUnitName(event.unit)}，兇手：${event.killer === undefined ? "無" : GetUnitName(event.killer)}`));
    }
    IssueTargetOrder(first, "attack", second);
    IssueTargetOrder(second, "attack", first);

    // 暴風雪有足夠長的引導時間，可觀察 0.8 秒計時及停止命令。
    const ability = FourCC("AHbz");
    UnitAddAbility(caster, ability);
    SetUnitAbilityLevel(caster, ability, 1);
    let attempt = 0;
    onSpellChannel.of(caster).subscribe(() => {
      attempt++;
      logger.info(`M3 施法 ${attempt}：引導`);
      if (attempt === 2) timer(0.2).subscribe(() => {
        logger.info("M3 第二次施法：下達停止命令。");
        IssueImmediateOrder(caster, "stop");
      });
    });
    onSpellCast.of(caster).subscribe(() => logger.info(`M3 施法 ${attempt}：施放`));
    onSpellEffect.of(caster).subscribe(() => logger.info(`M3 施法 ${attempt}：生效`));
    onSpellFinish.of(caster).subscribe(() => logger.info(`M3 施法 ${attempt}：完成`));
    onSpellEndCast.of(caster).subscribe(() => logger.info(`M3 施法 ${attempt}：結束`));
    onSpellChannel.of(caster).pipe(
      switchMap(() => timer(0.8, { phase: Phase.Combat }).pipe(takeUntil(onSpellEndCast.of(caster)))),
    ).subscribe(() => logger.info(`M3 施法 ${attempt}：0.8 秒計時送出值。`));
    timer(2).subscribe(() => logger.info(`M3 第一次施法命令成功：${IssuePointOrder(caster, "blizzard", -100, 0)}`));
    timer(12).subscribe(() => {
      BlzEndUnitAbilityCooldown(caster, ability);
      logger.info(`M3 第二次施法命令成功：${IssuePointOrder(caster, "blizzard", -100, 0)}`);
    });
    onPlayerChat.subscribe(event => logger.info(`M3 聊天，玩家 ${GetPlayerId(event.player)}：${event.message}`));
    logger.info("M3 範例已啟動。請觀察傷害、施法與聊天輸出。");
  } catch (error) {
    reportUnhandledError(error);
  }
}
