import { createLocalFileIo, FileWriteStatus } from "../../../file-io";
import { logger } from "../../../logger";
import { wc3FileIoNatives } from "../../../wc3-def/wc3-file-io-natives";
import { Subscription } from "../../index";
import { ProbeFunctions, probe } from "../metrics";
import { Fields, formatRecord, resultPages, resultValue } from "../results";

// 模組內的宣告可同時供 Node 型別檢查與 Lua 轉譯使用。
declare const os: { clock?: (this: void) => number } | undefined;
declare const collectgarbage: ((this: void, operation: string) => number) | undefined;

export function wc3Probes(): ProbeFunctions {
    return {
        clock: () => {
            if (typeof os === "undefined" || typeof os.clock !== "function")
                throw new Error("沒有 os.clock。");
            return os.clock();
        },
        memory: () => {
            if (typeof collectgarbage !== "function") throw new Error("沒有記憶體查詢函式。");
            return collectgarbage("count");
        },
        collect: () => {
            if (typeof collectgarbage !== "function") throw new Error("無法回收記憶體。");
            collectgarbage("collect");
        },
        stopGc: () => {
            if (typeof collectgarbage !== "function") throw new Error("無法暫停回收。");
            collectgarbage("stop");
        },
        restartGc: () => {
            if (typeof collectgarbage !== "function") throw new Error("無法恢復回收。");
            collectgarbage("restart");
        },
    };
}

export class Output {
    public readonly files = createLocalFileIo(wc3FileIoNatives);
    public readonly functions = wc3Probes();
    public readonly capabilities = probe(this.functions);

    public metadata(): string {
        const p = this.capabilities;
        return formatRecord({
            type: "probe",
            clock: p.clock,
            resolution_s: resultValue(p.resolution),
            timed: p.timed,
            memory: p.memory,
            collect: p.collect,
            pause_gc: p.pauseGc,
            clock_unit: "cpu_seconds",
            allocation: p.pauseGc ? "gc_paused_estimate" : "net_growth_only",
            fixture: 1,
        });
    }

    public write(name: string, records: readonly string[]): void {
        const pages = resultPages(records);
        for (let index = 0; index < pages.length; index++) {
            const suffix = index === 0 ? "" : `-${index + 1}`;
            const path = `InfiniteTowerRogue\\${name}${suffix}.pld`;
            const result = this.files.write(path, pages[index]);
            if (result.status !== FileWriteStatus.Issued)
                throw new Error(`基準結果${result.status}。`);
        }
        logger.info(
            `基準結果已送出：CustomMapData\\InfiniteTowerRogue\\${name}.pld（${pages.length} 檔，磁碟寫入待確認）。`,
        );
    }

    public row(fields: Fields): string {
        return formatRecord(fields);
    }
}

/** 只保留一個控制計時器。清理後不再呼叫工作。 */
export class Pump {
    private readonly timer = CreateTimer();
    public constructor(public readonly owner: Subscription) {
        owner.add(() => {
            PauseTimer(this.timer);
            DestroyTimer(this.timer);
        });
    }
    public later(callback: (this: void) => void, seconds = 0.03): void {
        if (this.owner.closed) return;
        TimerStart(this.timer, seconds, false, () => {
            if (this.owner.closed) return;
            try {
                callback();
            } catch (error) {
                logger.error(error);
                this.owner.unsubscribe();
            }
        });
    }
}
