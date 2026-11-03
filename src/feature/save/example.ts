import { createLocalFileIo } from "../../shared/file-io";
import { installWc3ClockDrivers, onPlayerChat, uiClock } from "../../shared/rxwc3";
import { wc3FileIoNatives } from "../../shared/wc3-def/wc3-file-io-natives";
import { wc3SyncNatives } from "../../shared/wc3-def/wc3-natives";
import { wc3SaveNatives } from "../../shared/wc3-def/wc3-save-natives";
import { logger } from "../../shared/logger";
import { installSaveChat } from "./chat";

declare function compiletime<T>(
    this: void,
    callback: (
        this: void,
        context: { objectData: import("war3-objectdata-th/dist/cjs").ObjectData },
    ) => T,
): T;

// 相依模組先建立檔案通道。main 的既有回呼會儲存全部物件。
compiletime(({ objectData }) => {
    const root = require("process").cwd();
    require(root + "/scripts/file-io.cjs").createFileIoAbility(objectData);
});

export function runSaveExample(): void {
    try {
        installWc3ClockDrivers();
        const files = createLocalFileIo(wc3FileIoNatives);
        const players: player[] = [];
        for (let index = 0; index < bj_MAX_PLAYER_SLOTS; index++) players.push(Player(index)!);
        installSaveChat(onPlayerChat, players, files, wc3SaveNatives, wc3SyncNatives, uiClock);
        const local = wc3SyncNatives.getLocalPlayer();
        wc3SaveNatives.display(
            local,
            `存檔範例已啟動。玩家原始名稱 [${wc3SaveNatives.playerName(local)}]。指令 -save、-load、-save-demo show。`,
        );
    } catch (error) {
        logger.error(error);
    }
}
