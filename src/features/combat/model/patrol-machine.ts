export interface Point {
    readonly x: number;
    readonly y: number;
}
export interface PatrolConfig {
    readonly prepareMs: number;
    readonly recoveryMs: number;
    readonly length: number;
    readonly width: number;
    readonly noticeRange: number;
    readonly chaseRange: number;
}
export type PatrolAction =
    | { readonly kind: "move"; readonly point: Point }
    | { readonly kind: "prepare" | "act" | "recover" };
function distance(a: Point, b: Point): number {
    const dx = a.x - b.x,
        dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/** 計時只使用短期整數毫秒，不累加世界浮點時間。 */
export class PatrolMachine {
    public state: "patrol" | "chase" | "prepare" | "act" | "recovery" = "patrol";
    public remainingMs = 0;
    public origin: Point;
    public direction = 0;
    private destination = 1;
    public constructor(
        public readonly config: PatrolConfig,
        private readonly points: readonly [Point, Point],
    ) {
        this.origin = points[0];
    }
    public contains(point: Point): boolean {
        const dx = point.x - this.origin.x,
            dy = point.y - this.origin.y;
        const along = dx * Math.cos(this.direction) + dy * Math.sin(this.direction);
        const across = -dx * Math.sin(this.direction) + dy * Math.cos(this.direction);
        return (
            along >= 0 && along <= this.config.length && Math.abs(across) <= this.config.width / 2
        );
    }
    public step(deltaMs: number, position: Point, target?: Point): PatrolAction | undefined {
        if (deltaMs < 0 || deltaMs > 1000 || deltaMs !== Math.floor(deltaMs))
            throw new Error("巡檢機步進必須是 0 至 1000 的整數毫秒。");
        if (this.state === "prepare" || this.state === "recovery") {
            this.remainingMs = Math.max(0, this.remainingMs - deltaMs);
            if (this.remainingMs > 0) return undefined;
            if (this.state === "prepare") {
                this.state = "act";
                return { kind: "act" };
            }
            this.state = "chase";
        }
        if (this.state === "act") {
            this.state = "recovery";
            this.remainingMs = this.config.recoveryMs;
            return { kind: "recover" };
        }
        if (
            this.state === "patrol" &&
            target !== undefined &&
            distance(position, target) <= this.config.noticeRange
        )
            this.state = "chase";
        if (this.state === "chase") {
            if (target === undefined || distance(position, target) > this.config.chaseRange)
                this.state = "patrol";
            else if (distance(position, target) <= this.config.length) {
                this.origin = { ...position };
                this.direction = Math.atan2(target.y - position.y, target.x - position.x);
                this.state = "prepare";
                this.remainingMs = this.config.prepareMs;
                return { kind: "prepare" };
            } else return { kind: "move", point: target };
        }
        if (distance(position, this.points[this.destination]) <= 32)
            this.destination = 1 - this.destination;
        return { kind: "move", point: this.points[this.destination] };
    }
    /** 作用完成後立即開始收招，不增加一個步進的等待。 */
    public recover(): void {
        this.state = "recovery";
        this.remainingMs = this.config.recoveryMs;
    }
}
