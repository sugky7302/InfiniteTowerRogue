import { logger } from "@shared/lib/logger";
import { Subscription } from "../core/subscription";
import { filter } from "../operators/filter";
import { map } from "../operators/map";
import { share } from "../operators/share";
import { localEffect, localSignal } from "../signal";
import { interval } from "../sources/interval";
import { timer } from "../sources/timer";
import { forLocalPlayer } from "../sync/for-local-player";
import { sync } from "../sync/sync";
import { onPlayerChat } from "./events";
import { installWc3ClockDrivers } from "./wc3-clock-driver";

// 全部訂閱與觸發器均在共同啟動流程建立。只有相機讀取與語言寫入是本地操作。
export function runM4Example(): void {
    try {
        installWc3ClockDrivers();
        const owner = new Subscription();
        const language = localSignal("zh-TW");
        owner.add(localEffect(() => logger.info(`M4 本地語言：${language()}`)));
        const tick = interval(5).pipe(share());
        for (let index = 0; index < 2; index++) {
            // TSTL 把 for 迴圈轉譯為共用一個變數的 while 迴圈。閉包須捕捉迴圈內的 const。
            const id = index;
            const player = Player(id)!;
            owner.add(
                tick
                    .pipe(
                        forLocalPlayer(player),
                        map(
                            () =>
                                `${Math.floor(GetCameraTargetPositionX())},${Math.floor(GetCameraTargetPositionY())}`,
                        ),
                        sync(player, {
                            prefix: `rxwc3.m4.camera.${id}`,
                            encode: (value) => value,
                            decode: (data) => data,
                        }),
                    )
                    .subscribe((value) => logger.info(`M4 同步相機，玩家 ${id}：${value}`)),
            );
            owner.add(
                onPlayerChat
                    .pipe(
                        filter(
                            (event) =>
                                event.player === player && event.message.indexOf("-lang ") === 0,
                        ),
                        forLocalPlayer(player),
                    )
                    .subscribe((event) => language.set(event.message.slice(6))),
            );
        }
        // 第一個玩家在第 2 秒送出超長資料。應只回報錯誤，接收端不應收到值。
        owner.add(
            timer(2)
                .pipe(
                    forLocalPlayer(Player(0)!),
                    map(() => "x".repeat(241)),
                    sync(Player(0)!, {
                        prefix: "rxwc3.m4.limit",
                        encode: (value) => value,
                        decode: (data) => data,
                    }),
                )
                .subscribe(() => logger.info("M4 錯誤：不應收到超長資料。")),
        );
        // 以 32 字元的固定 prefix 驗證 240 位元組與空資料的實際送達。
        owner.add(
            onPlayerChat
                .pipe(
                    filter(
                        (event) =>
                            event.player === Player(0)! &&
                            (event.message === "-m4-edge" || event.message === "-m4-empty"),
                    ),
                    forLocalPlayer(Player(0)!),
                    map((event) => (event.message === "-m4-edge" ? "文".repeat(80) : "")),
                    sync(Player(0)!, {
                        prefix: "rxwc3.m4.boundary.01234567890123",
                        encode: (value) => value,
                        decode: (data) => data,
                    }),
                )
                .subscribe((value) =>
                    logger.info(`M4 邊界接收：${value === "" ? "空字串" : "240 個位元組"}`),
                ),
        );
        owner.add(
            onPlayerChat.pipe(filter((event) => event.message === "-m4-stop")).subscribe(() => {
                owner.unsubscribe();
                logger.info("M4 已取消全部範例訂閱，並刪除同步觸發器。");
            }),
        );
        logger.info(
            "M4 已啟動。每 5 秒同步玩家 0 與 1 的相機。輸入 -lang en、-m4-edge、-m4-empty 或 -m4-stop。",
        );
    } catch (error) {
        logger.error(error);
    }
}
