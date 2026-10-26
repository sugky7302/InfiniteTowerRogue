import { logger } from "@shared/logger";
import { Phase, Subject, takeUntil, timer, uiClock, worldClock } from "../index";
import { installWc3ClockDrivers } from "./wc3-clock-driver";

// 僅供測試地圖手動接入。地圖啟動時呼叫一次，不由 src/main.ts 載入。
// 本次依使用者要求保留 main.ts 的測試 hook。上行為原始接入說明。
export function runM2Example(): void {
    const drivers = installWc3ClockDrivers();
    const cancelled = new Subject<void>();
    timer(12, { phase: Phase.Extraction })
        .pipe(takeUntil(cancelled))
        .subscribe({
            next: () => logger.error("錯誤：已取消的撤離仍送出值。"),
            complete: () => logger.info("已取消的撤離串流完成。"),
        });
    timer(12, { phase: Phase.Extraction }).subscribe(() =>
        logger.info("撤離完成，預期為實際第 15 秒。"),
    );
    const due = worldClock.now() + 1;
    worldClock.scheduleAt(due, () => logger.info("潮封"), Phase.World);
    worldClock.scheduleAt(due, () => logger.info("撤離完成"), Phase.Extraction);
    worldClock.scheduleAt(due, () => logger.info("傷害"), Phase.Combat);
    timer(5, { clock: uiClock }).subscribe(() => {
        cancelled.next();
        cancelled.complete();
        worldClock.pause();
        worldClock.pause();
        const paused = worldClock.now();
        timer(1, { clock: uiClock }).subscribe(() => {
            worldClock.resume();
            logger.info(
                `介面第 6 秒，世界仍暫停：${worldClock.isPaused()}，時間未變：${worldClock.now() === paused}`,
            );
        });
        timer(3, { clock: uiClock }).subscribe(() => worldClock.resume());
    });
    timer(2, { clock: uiClock }).subscribe(() => logger.info(`世界中途時間：${worldClock.now()}`));
    timer(16, { clock: uiClock }).subscribe(() => {
        logger.info(
            `世界無任務：${worldClock.pendingCount() === 0}，喚醒已釋放：${!drivers.world.hasWakeTimer()}，量時計時器保留：${drivers.world.hasTimer()}`,
        );
        const idleStart = worldClock.now();
        timer(2, { clock: uiClock }).subscribe(() => {
            const now = worldClock.now();
            logger.info(
                `世界閒置時間：${now}，預期約 15 秒；閒置增加約 2 秒：${Math.abs(now - idleStart - 2) < 0.05}`,
            );
            worldClock.pause();
            const paused = worldClock.now();
            timer(1, { clock: uiClock }).subscribe(() => {
                logger.info(`閒置暫停時間未變：${worldClock.now() === paused}`);
                worldClock.resume();
            });
        });
    });
    timer(1080, { clock: uiClock }).subscribe(() =>
        logger.info(`18 分鐘排程完成：${uiClock.now()}`),
    );
    timer(7200, { clock: uiClock }).subscribe(() =>
        logger.info(`2 小時排程完成：${uiClock.now()}`),
    );
}
