export interface PlayerNatives {
    /** `GetPlayerName` 的原始值。離線單人時為用戶端語言的文字（正體中文為 `本地玩家`）。 */
    playerName(player: player): string;
    /** 只在玩家本地呼叫。此方法不得建立 handle。 */
    display(player: player, text: string): void;
    /** 本地用戶端的語言代碼，例如 `zhTW`。只能用於顯示。 */
    getLocale(): string;
}
