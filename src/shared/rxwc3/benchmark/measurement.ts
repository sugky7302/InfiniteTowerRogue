import { elapsedUs, ProbeFunctions, ProbeResult, readNumber, attempt } from "./metrics";
import { Workload } from "./workloads";

/** 每次呼叫最多執行 25 次工作。外部用計時器分批呼叫。 */
export class Measurement {
    public completed = 0;
    public batches = 0;
    public microseconds: number | undefined;
    public allocationKb: number | undefined;
    public netKb: number | undefined;
    public maxBatchUs = 0;
    public gcCollected: boolean;
    private batchSize = 25;

    public constructor(
        private readonly work: Workload,
        private readonly functions: ProbeFunctions,
        private readonly capabilities: ProbeResult,
    ) {
        this.microseconds = capabilities.timed ? 0 : undefined;
        this.allocationKb = capabilities.pauseGc ? 0 : undefined;
        this.netKb = capabilities.memory ? 0 : undefined;
        this.gcCollected = capabilities.collect && attempt(functions.collect);
    }

    public runBatch(remaining: number): void {
        const count = Math.min(this.batchSize, remaining);
        const paused = this.capabilities.pauseGc && attempt(this.functions.stopGc);
        if (!paused) this.allocationKb = undefined;
        const memoryBefore = this.capabilities.memory
            ? readNumber(this.functions.memory)
            : undefined;
        const start = this.capabilities.timed ? readNumber(this.functions.clock) : undefined;
        let end: number | undefined;
        let memoryAfter: number | undefined;
        try {
            for (let index = 0; index < count; index++) this.work.step();
            end = this.capabilities.timed ? readNumber(this.functions.clock) : undefined;
            memoryAfter = this.capabilities.memory ? readNumber(this.functions.memory) : undefined;
        } finally {
            if (paused && !attempt(this.functions.restartGc)) this.allocationKb = undefined;
        }
        const duration = elapsedUs(start, end);
        if (duration === undefined || this.microseconds === undefined)
            this.microseconds = undefined;
        else {
            this.microseconds =
                duration > 2147483000 - this.microseconds
                    ? undefined
                    : this.microseconds + duration;
            this.maxBatchUs = Math.max(this.maxBatchUs, duration);
            if (duration >= 5000) this.batchSize = Math.max(1, Math.floor(this.batchSize / 2));
        }
        if (memoryBefore === undefined || memoryAfter === undefined || memoryAfter < memoryBefore)
            this.allocationKb = undefined;
        else if (this.allocationKb !== undefined) this.allocationKb += memoryAfter - memoryBefore;
        if (memoryBefore === undefined || memoryAfter === undefined) this.netKb = undefined;
        else if (this.netKb !== undefined) this.netKb += memoryAfter - memoryBefore;
        this.completed += count;
        this.batches++;
    }
}
