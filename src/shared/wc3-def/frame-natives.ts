export interface FrameNatives {
    start(seconds: number, callback: (this: void) => void): (this: void) => void;
}
