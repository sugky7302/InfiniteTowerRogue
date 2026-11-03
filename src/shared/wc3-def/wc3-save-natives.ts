import { SaveNatives } from "./save-natives";

export const wc3SaveNatives: SaveNatives = {
    playerName: (player) => GetPlayerName(player) ?? "",
    display: (player, text) => DisplayTimedTextToPlayer(player, 0, 0, 30, text),
};
