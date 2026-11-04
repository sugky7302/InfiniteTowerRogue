import { SaveSection, SaveValue } from "./format";

export interface SaveParticipant {
    readonly section: SaveSection;
    /** 舊版轉換的常數，不得讀取遊戲狀態。 */
    readonly empty: Record<string, SaveValue>;
    collect(player: player): Record<string, SaveValue> | undefined;
    /** 只驗證資料。全部參與者成功後才執行傳回的函式。 */
    prepare(player: player, values: Record<string, SaveValue>): ((this: void) => void) | undefined;
}
