import { createLocalFileIo } from "@shared/file-io";
import { installWc3ClockDrivers, onPlayerChat, uiClock } from "@shared/rxwc3";
import { wc3FileNatives, wc3PlayerNatives, wc3SyncNatives } from "@shared/wc3-def";
import { logger } from "@shared/logger";
import { installSaveChat, SaveParticipant } from "@features/save";

export function runSaveExample(participants: readonly SaveParticipant[] = []): void {
    try {
        installWc3ClockDrivers();
        const files = createLocalFileIo(wc3FileNatives);
        const players: player[] = [];
        for (let index = 0; index < bj_MAX_PLAYER_SLOTS; index++) players.push(Player(index)!);
        installSaveChat(
            onPlayerChat,
            players,
            files,
            wc3PlayerNatives,
            wc3SyncNatives,
            uiClock,
            undefined,
            participants,
        );
        const local = wc3SyncNatives.getLocalPlayer();
        wc3PlayerNatives.display(
            local,
            `存檔範例已啟動。玩家原始名稱 [${wc3PlayerNatives.playerName(local)}]。指令 -save、-load、-save-demo show。`,
        );
    } catch (error) {
        logger.error(error);
    }
}
