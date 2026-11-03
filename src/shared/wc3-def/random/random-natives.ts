export interface RandomNatives {
    /** 同步亂數。全部用戶端以相同順序呼叫時得到相同結果。 */
    randomInt(low: number, high: number): number;
}
