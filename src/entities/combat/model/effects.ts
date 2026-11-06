import { Clock, Phase, Subscription, addTicks, durationTicks } from "@shared/lib/rxwc3";

export function periodicTicks(
    start: number,
    delay: number,
    period: number,
    duration: number,
): number[] {
    if (period <= 0) throw new Error("週期間隔必須大於 0。");
    const result: number[] = [];
    const end = addTicks(start, durationTicks(duration));
    const step = durationTicks(period);
    if (step === 0) throw new Error("週期間隔不得小於一毫秒。");
    let due = addTicks(start, durationTicks(delay));
    while (due <= end) {
        result.push(due);
        if (end - due < step) break;
        due = addTicks(due, step);
    }
    return result;
}

/** 每個來源與承受者持有一個實例。刷新只取消尚未發生的事件。 */
export class Burning {
    private pending = new Subscription();
    public constructor(
        private readonly clock: Clock,
        private readonly tick: (this: void) => void,
    ) {}
    public refresh(delay: number, period: number, duration: number): void {
        this.clear();
        this.pending = new Subscription();
        for (const due of periodicTicks(this.clock.nowTicks(), delay, period, duration)) {
            this.pending.add(this.clock.scheduleAtTicks(due, this.tick, Phase.Combat));
        }
    }
    public clear(): void {
        this.pending.unsubscribe();
    }
}

interface SlowEntry {
    source: unknown;
    group: string;
    multiplier: number;
    expiry: Subscription;
}
export class MovementSlows {
    private entries: SlowEntry[] = [];
    public constructor(
        private readonly clock: Clock,
        private readonly apply: (this: void, multiplier: number) => void,
    ) {}
    public refresh(source: unknown, group: string, multiplier: number, seconds: number): void {
        this.remove(source, group);
        const entry: SlowEntry = {
            source,
            group,
            multiplier: Math.max(0, Math.min(1, multiplier)),
            expiry: new Subscription(),
        };
        this.entries.push(entry);
        entry.expiry.add(
            this.clock.schedule(seconds, () => this.remove(source, group), Phase.Combat),
        );
        this.update();
    }
    public remove(source: unknown, group: string): void {
        for (let index = this.entries.length - 1; index >= 0; index--) {
            const entry = this.entries[index];
            if (entry.source === source && entry.group === group) {
                entry.expiry.unsubscribe();
                this.entries.splice(index, 1);
            }
        }
        this.update();
    }
    private update(): void {
        let multiplier = 1;
        for (const entry of this.entries) multiplier = Math.min(multiplier, entry.multiplier);
        this.apply(multiplier);
    }
    public clear(): void {
        for (const entry of this.entries) entry.expiry.unsubscribe();
        this.entries.length = 0;
        this.update();
    }
}
