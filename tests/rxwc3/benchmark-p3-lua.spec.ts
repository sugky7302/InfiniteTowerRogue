import {
    batch,
    computed,
    config,
    effect,
    signal,
    Subject,
    Subscriber,
} from "../../src/shared/rxwc3";
import { createWorkload } from "../../src/shared/rxwc3/benchmark/workloads";

export { createWorkload };

function check(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

/** Node 與 Lua 共用。檢查重用狀態在錯誤及巢狀呼叫後仍可使用。 */
export function verifyBenchmarkP3(): number {
    const saved = config.onUnhandledError;
    const errors: unknown[] = [];
    config.onUnhandledError = (error) => errors.push(error);
    try {
        class Custom extends Subscriber<number> {
            public next(value: number): void {
                super.next(value);
                throw "自訂方法錯誤";
            }
        }
        const source = new Subject<number>();
        const values: number[] = [];
        source.subscribe(
            new Custom({
                next: () => {
                    throw "回呼錯誤";
                },
            }),
        );
        source.subscribe((value) => values.push(value));
        source.next(1);
        source.next(2);
        check(values.join(",") === "1,2" && errors.length === 4, "自訂方法或巢狀保護失效。");

        class Terminal extends Subscriber<number> {
            public error(): void {
                throw "自訂錯誤通知失敗";
            }
            public complete(): void {
                throw "自訂完成通知失敗";
            }
        }
        class Cancellation extends Subscriber<number> {
            public unsubscribe(): void {
                super.unsubscribe();
                throw "自訂取消失敗";
            }
        }
        for (const terminal of ["error", "complete"] as const) {
            const subject = new Subject<number>();
            let completed = false;
            subject.subscribe(new Terminal());
            subject.subscribe(new Cancellation());
            subject.subscribe({
                error: () => {
                    completed = true;
                },
                complete: () => {
                    completed = true;
                },
            });
            if (terminal === "error") subject.error("終止");
            else subject.complete();
            check(completed, "自訂終止方法中斷其他訂閱者。");
        }

        const trigger = signal(0);
        const nested = signal(0);
        const first = computed(() => nested() * 2);
        const second = computed(() => nested() * 3);
        const seen: string[] = [];
        const writer = effect(() => {
            nested.set(trigger());
        });
        const reader = effect(() => {
            seen.push(`${first()},${second()}`);
        });
        batch(() => {
            trigger.set(1);
            trigger.set(2);
        });
        trigger.set(3);
        check(seen.join(";") === "0,0;4,6;6,9", "巢狀寫入產生中間值。");
        writer.destroy();
        reader.destroy();

        const orderedSource = signal(0);
        const rerun = signal(0);
        const order: number[] = [];
        const older = effect(() => {
            orderedSource();
            rerun();
            order.push(1);
        });
        const newer = effect(() => {
            orderedSource();
            order.push(2);
        });
        rerun.set(1);
        order.length = 0;
        orderedSource.set(1);
        check(order.join(",") === "2,1", "重新讀取後的通知順序改變。");
        older.destroy();
        newer.destroy();

        const branch = signal(true);
        const left = signal(1);
        const right = signal(2);
        let calls = 0;
        const result = computed(() => {
            calls++;
            return branch() ? left() + left() : right() + left();
        });
        check(result() === 2, "重複讀取錯誤。");
        branch.set(false);
        check(result() === 3, "動態依賴錯誤。");
        branch.set(true);
        check(result() === 2, "依賴切回錯誤。");
        const previousCalls = calls;
        right.set(9);
        check(result() === 2 && calls === previousCalls, "舊依賴未移除。");

        let fail = false;
        const compared = signal(0, {
            equal: (a, b) => {
                right();
                if (fail) throw "相等比較錯誤";
                return a === b;
            },
        });
        let effectCalls = 0;
        const comparisonReader = effect(() => {
            compared();
            effectCalls++;
        });
        fail = true;
        let caught = false;
        try {
            compared.set(1);
        } catch {
            caught = true;
        }
        fail = false;
        compared.set(2);
        right.set(10);
        check(caught && effectCalls === 2, "相等比較未恢復追蹤狀態。");
        comparisonReader.destroy();

        const loop = signal(0);
        const loopEffect = effect(() => {
            const value = loop();
            if (value > 0) loop.set(value + 1);
        });
        loop.set(1);
        check(loopEffect.closed, "巢狀寫入重設了循環上限。");
        const healthy = signal(0);
        let current = -1;
        const healthyReader = effect(() => {
            current = healthy();
        });
        healthy.set(1);
        check(current === 1, "循環後佇列未恢復。");
        healthyReader.destroy();

        for (const spec of [
            { id: "B1-subject-20", kind: "subject", width: 20 },
            { id: "B1-hub-20", kind: "hub", width: 20 },
            { id: "B3-100", kind: "signal", width: 100 },
        ] as const) {
            const rx = createWorkload(spec, "rx");
            const native = createWorkload(spec, "native");
            for (let index = 0; index < 10; index++) {
                rx.step();
                native.step();
            }
            check(rx.checksum() === native.checksum(), "工作負載檢查值不同。");
            rx.dispose();
            native.dispose();
        }
        return 7;
    } finally {
        config.onUnhandledError = saved;
    }
}
