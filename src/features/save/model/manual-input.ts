import { Clock, fragmentNumber, FragmentReceiver } from "@shared/rxwc3";
import { compactCode, maxSaveCodeLength } from "./codec";

export const manualFragmentLength = 80;

export function loadCommands(code: string): string[] {
    const compact = compactCode(code);
    const count = Math.ceil(compact.length / manualFragmentLength);
    const commands: string[] = [];
    if (code.length + 6 <= 126) commands.push(`-load ${code}`);
    for (let index = 0; index < count; index++)
        commands.push(
            `-load ${index + 1}/${count} ${compact.slice(index * manualFragmentLength, (index + 1) * manualFragmentLength)}`,
        );
    return commands;
}

/** 第一次的 1/n 可晚到。已收到 1/n 後再次輸入 1/n 會開始新一批。 */
export class ManualSaveInput {
    private readonly receiver: FragmentReceiver;
    private sequence = 0;
    private count = 0;
    private firstSeen = false;

    public constructor(
        clock: Clock,
        private readonly failed: (this: void) => void,
    ) {
        this.receiver = new FragmentReceiver(clock, 60000, () => {
            this.reset();
            this.failed();
        });
    }

    public accept(text: string): string | undefined {
        const space = text.indexOf(" ");
        const header = text.slice(0, space).split("/");
        const index = header.length === 2 ? fragmentNumber(header[0]) : undefined;
        const count = header.length === 2 ? fragmentNumber(header[1]) : undefined;
        const data = space < 0 ? "" : compactCode(text.slice(space + 1));
        if (
            index === undefined ||
            count === undefined ||
            count > Math.ceil(maxSaveCodeLength / manualFragmentLength) ||
            index > count ||
            data.length < 1 ||
            data.length > manualFragmentLength
        ) {
            this.reset();
            this.failed();
            return undefined;
        }
        if (this.count === 0 || (index === 1 && this.firstSeen)) {
            if (this.sequence === 1048575) {
                this.failed();
                return undefined;
            }
            this.reset();
            this.sequence++;
            this.count = count;
        }
        if (index === 1) this.firstSeen = true;
        const result = this.receiver.accept({ transfer: this.sequence, index, count, data });
        if (result !== undefined) this.reset();
        return result;
    }

    public reset(): void {
        this.receiver.clear();
        this.count = 0;
        this.firstSeen = false;
    }
}
