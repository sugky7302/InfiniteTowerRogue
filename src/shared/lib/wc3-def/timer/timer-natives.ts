export interface TimerNatives {
    /** 啟動週期計時器。傳回的函式停止並銷毀計時器。 */
    start(seconds: number, callback: (this: void) => void): (this: void) => void;
}
