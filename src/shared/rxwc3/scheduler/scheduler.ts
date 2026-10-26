import { Subscription } from "../core/subscription";
import { Phase } from "./phase";
import { checkTicks } from "./time";

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
