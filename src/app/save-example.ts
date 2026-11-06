import { createLocalFileIo } from "@shared/lib/file-io";
import { installWc3ClockDrivers, onPlayerChat, uiClock } from "@shared/lib/rxwc3";
import { wc3FileNatives, wc3PlayerNatives, wc3SyncNatives } from "@shared/lib/wc3-def";
import { logger } from "@shared/lib/logger";
import { getI18n, installLanguageChat } from "@shared/lib/i18n";
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
        const i18n = getI18n(files);
        installLanguageChat(i18n, onPlayerChat, players, (text) => logger.info(text));
        const local = wc3SyncNatives.getLocalPlayer();
        wc3PlayerNatives.display(
            local,
            `存檔範例已啟動。玩家原始名稱 [${wc3PlayerNatives.playerName(local)}]。指令 -save、-load、-save-demo show、-lang <語言>。`,
        );
        wc3PlayerNatives.display(
            local,
            `語言偏好讀檔結果：${i18n.preference?.result.status ?? "未讀取"}。採用語言：${i18n.language()}。`,
        );
    } catch (error) {
        logger.error(error);
    }
}
