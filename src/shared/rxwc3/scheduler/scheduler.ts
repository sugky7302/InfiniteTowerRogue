import { Subscription } from "../core/subscription";
import { Phase } from "./phase";
import { checkTicks } from "./time";

/**
 * 排程中的一個任務。繼承 `Subscription`：取消任務就是 `unsubscribe()`，例如 `takeUntil` 中斷 `timer` 時。
 * - `heapIndex`：任務在堆積陣列中的位置。取消時直接從此位置移除，不必搜尋整個陣列。-1 表示不在堆積中。
 * - `dueTicks`、`phase`、`order`：排序依據，見 `Scheduler.before`。
 */
export class ScheduledTask extends Subscription {
    public heapIndex = -1;

    public constructor(
        public readonly dueTicks: number,
        public readonly phase: Phase,
        public readonly order: number,
        public callback: ((this: void) => void) | undefined,
        cancel: (this: void) => void,
    ) {
        super(cancel);
    }
}

/**
 * 優先佇列：保存未來要執行的任務，隨時能取出「下一個應執行的任務」。只負責排序，不處理時間與 WC3 計時器。
 * ```
 * timer() / delay() / interval()
 *   → Clock.schedule() → Scheduler.schedule()      加入任務
 *   Clock 只為 Scheduler.peek()（最早到期者）啟動一個 WC3 計時器
 *   → 計時器觸發 → Clock.flush() → Scheduler.pop()  依序取出已到期任務並執行
 * ```
 * 因此不論排了多少任務，每個時鐘只使用一個 WC3 計時器（B4 基準：500 個任務只用 2 個計時器）。
 *
 * 實作為最小堆積：`peek` 為 O(1)，加入、取出、取消為 O(log n)。排序好的陣列在加入與取消時為 O(n)。
 * `up`／`down` 是堆積的標準調整：維持「父節點一定比子節點早」。
 */
export class Scheduler {
    private readonly heap: ScheduledTask[] = [];
    private order = 0;

    public schedule(
        dueTicks: number,
        phase: Phase,
        callback: (this: void) => void,
        onCancel: (this: void) => void = () => {},
    ): ScheduledTask {
        checkTicks(dueTicks);
        // order 是加入順序。WC3 Lua 為 32 位元整數，所以堆積清空時歸零，到達上限時拋出錯誤。
        if (this.heap.length === 0) this.order = 0;
        if (this.order === 2147483647) throw new Error("排程加入順序超過 2147483647 上限。");
        const task = new ScheduledTask(dueTicks, phase, this.order++, callback, () => {
            this.remove(task);
            task.callback = undefined;
            onCancel();
        });
        task.heapIndex = this.heap.length;
        this.heap.push(task);
        this.up(task.heapIndex);
        return task;
    }

    public peek(): ScheduledTask | undefined {
        return this.heap[0];
    }

    public size(): number {
        return this.heap.length;
    }

    public pop(): ScheduledTask | undefined {
        const task = this.peek();
        if (task !== undefined) {
            this.remove(task);
        }
        return task;
    }

    /**
     * a 是否應早於 b 執行。依序比較：
     * 1. `dueTicks`：到期時間（整數毫秒），早者先執行。
     * 2. `phase`：同一時間點的結算階段，Combat → Extraction → World → Default
     *    （設計文件：傷害與失能 → 撤離完成 → 潮封）。
     * 3. `order`：加入先後，先加入者先執行。
     */
    private before(a: ScheduledTask, b: ScheduledTask): boolean {
        return (
            a.dueTicks < b.dueTicks ||
            (a.dueTicks === b.dueTicks &&
                (a.phase < b.phase || (a.phase === b.phase && a.order < b.order)))
        );
    }

    private swap(a: number, b: number): void {
        const first = this.heap[a];
        this.heap[a] = this.heap[b];
        this.heap[b] = first;
        this.heap[a].heapIndex = a;
        this.heap[b].heapIndex = b;
    }

    private up(start: number): void {
        let index = start;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (!this.before(this.heap[index], this.heap[parent])) break;
            this.swap(index, parent);
            index = parent;
        }
    }

    private down(start: number): void {
        let index = start;
        while (index * 2 + 1 < this.heap.length) {
            let child = index * 2 + 1;
            if (child + 1 < this.heap.length && this.before(this.heap[child + 1], this.heap[child]))
                child++;
            if (!this.before(this.heap[child], this.heap[index])) break;
            this.swap(index, child);
            index = child;
        }
    }

    private remove(task: ScheduledTask): void {
        const index = task.heapIndex;
        if (index < 0) return;
        const last = this.heap.pop()!;
        task.heapIndex = -1;
        if (index < this.heap.length) {
            this.heap[index] = last;
            last.heapIndex = index;
            this.up(index);
            this.down(last.heapIndex);
        }
    }
}
