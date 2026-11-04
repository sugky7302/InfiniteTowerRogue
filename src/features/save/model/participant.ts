import { SaveSection, SaveValue } from "./format";

export interface SaveParticipant {
    readonly section: SaveSection;
    /** 舊版轉換的常數，不得讀取遊戲狀態。 */
    readonly empty: Record<string, SaveValue>;
    /** 提供版本 3 的區段與轉換。未提供時，區段沿用到版本 4。 */
    readonly previous?: {
        readonly section: SaveSection;
        readonly empty: Record<string, SaveValue>;
        readonly migrate: (
            this: void,
            values: Record<string, SaveValue>,
        ) => Record<string, SaveValue>;
    };
    collect(player: player): Record<string, SaveValue> | undefined;
    /** 只驗證資料。全部參與者成功後才執行傳回的函式。 */
    prepare(player: player, values: Record<string, SaveValue>): ((this: void) => void) | undefined;
}
