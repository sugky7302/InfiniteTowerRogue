export interface SaveNatives {
    playerName(player: player): string;
    /** 只在玩家本地呼叫。此方法不得建立 handle。 */
    display(player: player, text: string): void;
}
