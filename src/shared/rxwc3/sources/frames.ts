import { FrameNatives } from "../../wc3-def/frame-natives";
import { wc3FrameNatives } from "../../wc3-def/wc3-frame-natives";
import { Observable } from "../core/observable";
import { share } from "../operators/share";
import { Clock } from "../scheduler/clock";
import { worldClock } from "../scheduler/clocks";

export interface Frame {
    readonly deltaSeconds: number;
}

export interface FrameOptions {
    readonly seconds?: number;
    readonly clock?: Clock;
    readonly natives?: FrameNatives;
}

let defaultFrames: Observable<Frame> | undefined;

/** 每個來源共用一個週期計時器。無訂閱時銷毀；暫停期間略過幀，不補發。 */
export function frames(options?: FrameOptions): Observable<Frame> {
    if (options === undefined && defaultFrames !== undefined) return defaultFrames;
    const seconds = options?.seconds ?? 1 / 32;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) {
        throw new Error("幀間隔必須大於 0 且不超過 60 秒。");
    }
    const clock = options?.clock ?? worldClock;
    const natives = options?.natives ?? wc3FrameNatives;
    const frame: Frame = { deltaSeconds: seconds };
    const source = new Observable<Frame>((subscriber) =>
        natives.start(seconds, () => {
            if (!clock.isPaused()) subscriber.next(frame);
        }),
    ).pipe(share());
    if (options === undefined) defaultFrames = source;
    return source;
}
