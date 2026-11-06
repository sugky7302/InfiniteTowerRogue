import { Clock } from "../scheduler/clock";
import { Subscription } from "../core/subscription";
import { syncDataByteLength, validSyncData } from "./limits";

export const maxFragmentCount = 64;
export const maxTransferBytes = 4096;

export interface Fragment {
    transfer: number;
    index: number;
    count: number;
    data: string;
}

/** 以最新傳輸序號取代舊資料。完成或逾時的序號不可重播。 */
export class FragmentReceiver {
    private latest = 0;
    private parts: Map<number, string> | undefined;
    private count = 0;
    private length = 0;
    private timeout: Subscription | undefined;

    public constructor(
        private readonly clock: Clock,
        private readonly timeoutMilliseconds: number,
        private readonly failed: (this: void) => void = () => {},
    ) {
        if (
            !Number.isInteger(timeoutMilliseconds) ||
            timeoutMilliseconds < 1 ||
            timeoutMilliseconds > 600000
        )
            throw new Error("分段接收逾時範圍無效。");
    }

    public accept(fragment: Fragment): string | undefined {
        const { transfer, index, count, data } = fragment;
        if (
            !Number.isInteger(transfer) ||
            transfer < 1 ||
            transfer > 1048575 ||
            !Number.isInteger(count) ||
            count < 1 ||
            count > maxFragmentCount ||
            !Number.isInteger(index) ||
            index < 1 ||
            index > count
        )
            return undefined;
        if (transfer < this.latest || (transfer === this.latest && this.parts === undefined))
            return undefined;
        if (transfer > this.latest) {
            this.clear();
            this.latest = transfer;
            this.parts = new Map();
            this.count = count;
            this.timeout = this.clock.scheduleTicks(this.timeoutMilliseconds, () => {
                this.clear();
                this.failed();
            });
        }
        const existing = this.parts!.get(index);
        if (
            count !== this.count ||
            (existing !== undefined && existing !== data) ||
            !validSyncData(data)
        ) {
            this.clear();
            this.failed();
            return undefined;
        }
        if (existing !== undefined) return undefined;
        this.length += syncDataByteLength(data);
        if (this.length > maxTransferBytes) {
            this.clear();
            this.failed();
            return undefined;
        }
        this.parts!.set(index, data);
        if (this.parts!.size !== count) return undefined;
        const ordered: string[] = [];
        for (let part = 1; part <= count; part++) ordered.push(this.parts!.get(part)!);
        this.clear();
        return ordered.join("");
    }

    public clear(): void {
        this.timeout?.unsubscribe();
        this.timeout = undefined;
        this.parts = undefined;
        this.length = 0;
    }
}

/** 不接受前導零、符號、小數及過長整數。 */
export function fragmentNumber(text: string): number | undefined {
    if (text.length < 1 || text.length > 7 || text.charAt(0) === "0") return undefined;
    let value = 0;
    for (let index = 0; index < text.length; index++) {
        const digit = text.charCodeAt(index) - 48;
        if (digit < 0 || digit > 9) return undefined;
        value = value * 10 + digit;
    }
    return value <= 1048575 ? value : undefined;
}

export function decodeFragment(text: string): Fragment | undefined {
    const end = text.indexOf(":");
    if (end < 0 || end > 16) return undefined;
    const numbers = text.slice(0, end).split("/");
    if (numbers.length !== 3) return undefined;
    const transfer = fragmentNumber(numbers[0]);
    const index = fragmentNumber(numbers[1]);
    const count = fragmentNumber(numbers[2]);
    if (transfer === undefined || index === undefined || count === undefined) return undefined;
    return { transfer, index, count, data: text.slice(end + 1) };
}
