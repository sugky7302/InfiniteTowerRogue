import { PlayerNatives } from "./player-natives";

export const wc3PlayerNatives: PlayerNatives = {
    playerName: (player) => GetPlayerName(player) ?? "",
    display: (player, text) => DisplayTimedTextToPlayer(player, 0, 0, 30, text),
    getLocale: () => BlzGetLocale() ?? "",
};
