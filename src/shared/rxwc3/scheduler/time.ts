export const TICKS_PER_SECOND = 1000;
export const MAX_SECONDS = 2147483;
export const MAX_TICKS = 2147483000;

export function toTicks(seconds: number): number {
    if (!Number.isFinite(seconds) || Math.abs(seconds) > MAX_SECONDS) {
        throw new Error("時間必須是絕對值不超過 2147483 的有限秒數。");
    }
    // 先取得 Lua 整數，避免大數的浮點乘法失去毫秒精度。
    const whole = Math.floor(seconds);
    return whole * TICKS_PER_SECOND + Math.floor((seconds - whole) * TICKS_PER_SECOND + 0.5);
}

export function checkTicks(ticks: number): number {
    if (
        !Number.isFinite(ticks) ||
        ticks < -MAX_TICKS ||
        ticks > MAX_TICKS ||
        Math.floor(ticks) !== ticks
    ) {
        throw new Error("時間必須是絕對值不超過 2147483000 的整數毫秒。");
    }
    return ticks;
}

export function addTicks(current: number, duration: number): number {
    checkTicks(current);
    checkTicks(duration);
    if (
        (duration > 0 && current > MAX_TICKS - duration) ||
        (duration < 0 && current < -MAX_TICKS - duration)
    ) {
        throw new Error("時鐘時間超過 2147483000 毫秒上限，請建立新的時鐘。");
    }
    return current + duration;
}

export function durationTicks(seconds: number): number {
    return Math.max(0, toTicks(seconds));
}
