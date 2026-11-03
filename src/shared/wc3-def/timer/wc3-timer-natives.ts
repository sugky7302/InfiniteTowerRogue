import { TimerNatives } from "./timer-natives";

export const wc3TimerNatives: TimerNatives = {
    start(seconds, callback) {
        const handle = CreateTimer();
        TimerStart(handle, seconds, true, callback);
        return () => {
            PauseTimer(handle);
            DestroyTimer(handle);
        };
    },
};
