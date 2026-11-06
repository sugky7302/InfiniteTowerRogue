import { getI18n } from "../../../i18n/translation";
import { logger } from "../../../logger";
import { onPlayerChat, Subscription } from "../../index";
import { Output } from "./runtime";
import { runP1 } from "./p1";
import { runStress } from "./stress";

declare function compiletime<T>(
    this: void,
    callback: (
        this: void,
        context: {
            objectData: import("war3-objectdata-th/dist/cjs").ObjectData;
        },
    ) => T,
): T;

// 自動模式：建置時設定環境變數 BENCH_AUTO（例如 "-bench-stress rx"），地圖啟動後自動執行該指令。
// 完成後寫入 bench-auto-done.pld，讓建置端偵測並讀取結果。未設定時為空字串，不影響一般建置。
const AUTO_COMMAND: string = compiletime(() => require("process").env.BENCH_AUTO ?? "");
const AUTO_DELAY_SECONDS = 3;

export function runBenchmarkExample(): void {
    let active: Subscription | undefined;
    try {
        const output = new Output();
        // 保留函式庫的語言偏好讀取。範例單位與範例聊天不再安裝。
        getI18n(output.files);
        const handle = (command: string): void => {
            if (command === "-bench-stop") {
                active?.unsubscribe();
                active = undefined;
                logger.info("基準已停止。已送出目前結果，並清理基準資源。");
                return;
            }
            const valid =
                command === "-bench" ||
                command === "-bench-stress rx" ||
                command === "-bench-stress native" ||
                command === "-bench-soak rx" ||
                command === "-bench-soak native";
            if (!valid) return;
            let humans = 0;
            for (let id = 0; id < bj_MAX_PLAYER_SLOTS; id++) {
                const player = Player(id)!;
                if (
                    GetPlayerController(player) === MAP_CONTROL_USER &&
                    GetPlayerSlotState(player) === PLAYER_SLOT_STATE_PLAYING
                )
                    humans++;
            }
            if (humans > 1) {
                logger.warn("基準只供單人測試。請在單人地圖執行。");
                return;
            }
            if (active !== undefined && !active.closed) {
                logger.warn("已有基準執行中。請先使用 -bench-stop。");
                return;
            }
            active = new Subscription();
            if (AUTO_COMMAND !== "") {
                active.add(() => {
                    output.files.write("InfiniteTowerRogue\\bench-auto-done.pld", "done");
                });
            }
            try {
                if (command === "-bench") runP1(output, active);
                else
                    runStress(
                        output,
                        active,
                        command.endsWith("native") ? "native" : "rx",
                        command.startsWith("-bench-soak"),
                    );
            } catch (error) {
                logger.error(error);
                active.unsubscribe();
            }
        };
        onPlayerChat.subscribe((event) => handle(event.message));
        if (AUTO_COMMAND !== "") {
            logger.info(`基準自動模式：${AUTO_DELAY_SECONDS} 秒後執行 ${AUTO_COMMAND}。`);
            TimerStart(CreateTimer(), AUTO_DELAY_SECONDS, false, () => handle(AUTO_COMMAND));
        }
        logger.info(
            `基準已就緒：時鐘${output.capabilities.timed ? "可用" : "不可量測"}，記憶體${output.capabilities.memory ? "可用" : "不可用"}。指令：-bench、-bench-stress rx|native、-bench-soak rx|native、-bench-stop。`,
        );
    } catch (error) {
        logger.error(error);
        active?.unsubscribe();
    }
}
