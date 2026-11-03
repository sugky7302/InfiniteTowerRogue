import { FrameNatives } from "./frame-natives";

export const wc3FrameNatives: FrameNatives = {
    start(seconds, callback) {
        const handle = CreateTimer();
        TimerStart(handle, seconds, true, callback);
        return () => {
            PauseTimer(handle);
            DestroyTimer(handle);
        };
    },
};
