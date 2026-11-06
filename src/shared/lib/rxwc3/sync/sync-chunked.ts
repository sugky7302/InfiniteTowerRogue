import { Observable } from "../core/observable";
import { Subscriber } from "../core/subscriber";
import { reportUnhandledError } from "../core/config";
import { Clock } from "../scheduler/clock";
import { uiClock } from "../scheduler/clocks";
import { PlayerInput, unwrapPlayer, SyncNatives, wc3SyncNatives } from "@shared/lib/wc3-def";
import { Local, Sync } from "./types";
import { sync, SyncOptions } from "./sync";
import {
    decodeFragment,
    FragmentReceiver,
    MAX_FRAGMENT_COUNT,
    MAX_TRANSFER_BYTES,
} from "./fragments";

export interface ChunkedSyncOptions<T> extends SyncOptions<T> {
    clock?: Clock;
    timeoutMilliseconds?: number;
    /** 每片資料位元組數，範圍為 4 至 200。 */
    chunkBytes?: number;
    /** 同步接收失敗通知。顯示文字須由呼叫者限制為擁有者本地。 */
    onReceiveFailure?: (this: void) => void;
}

/** 每片最多 200 個 UTF-8 位元組，預留 40 位元組給序號標頭。 */
export function splitSyncData(data: string, chunkBytes = 200): string[] | undefined {
    if (!Number.isInteger(chunkBytes) || chunkBytes < 4 || chunkBytes > 200) return undefined;
    const parts: string[] = [];
    let part = "";
    let bytes = 0;
    let total = 0;
    for (let index = 0; index < data.length; index++) {
        const code = data.charCodeAt(index);
        let character = data.charAt(index);
        let length = code < 128 ? 1 : code < 2048 ? 2 : 3;
        if (typeof string !== "undefined") {
            let width = 1;
            if (code >= 194 && code <= 223) width = 2;
            else if (code >= 224 && code <= 239) width = 3;
            else if (code >= 240 && code <= 244) width = 4;
            character = data.slice(index, index + width);
            length = character.length;
            index += length - 1;
        } else if (code >= 55296 && code <= 56319 && index + 1 < data.length) {
            const next = data.charCodeAt(index + 1);
            if (next >= 56320 && next <= 57343) {
                character += data.charAt(++index);
                length = 4;
            }
        }
        if (character.indexOf("\0") >= 0) return undefined;
        total += length;
        if (total > MAX_TRANSFER_BYTES) return undefined;
        if (bytes + length > chunkBytes) {
            parts.push(part);
            part = "";
            bytes = 0;
        }
        part += character;
        bytes += length;
    }
    parts.push(part);
    return parts.length <= MAX_FRAGMENT_COUNT ? parts : undefined;
}
declare const string: unknown;

/** 訂閱與取消沿用 sync 的共同流程規則。只有擁有者會執行編碼與送出。 */
export function syncChunked<T>(
    player: PlayerInput,
    options: ChunkedSyncOptions<T>,
    natives: SyncNatives = wc3SyncNatives,
): (this: void, source: Observable<T, Local>) => Observable<T, Sync> {
    const { prefix, encode, decode, onReceiveFailure } = options;
    const clock = options.clock ?? uiClock;
    const timeout = options.timeoutMilliseconds ?? 15000;
    const chunkBytes = options.chunkBytes ?? 200;
    const owner = unwrapPlayer(player);
    return (source) =>
        new Observable<T, Sync>((subscriber) => {
            const receiver = new FragmentReceiver(clock, timeout, onReceiveFailure);
            subscriber.add(() => receiver.clear());
            const outgoing = new Observable<string, Local>((destination) => {
                let sequence = 0;
                const input = new Subscriber<T>({
                    next(value) {
                        if (natives.getLocalPlayer() !== owner) return;
                        try {
                            const parts = splitSyncData(encode(value), chunkBytes);
                            if (parts === undefined || sequence === 1048575)
                                throw new Error("分段同步資料超過上限，未送出。");
                            sequence++;
                            for (let index = 0; index < parts.length; index++)
                                destination.next(
                                    `${sequence}/${index + 1}/${parts.length}:${parts[index]}`,
                                );
                        } catch (error) {
                            reportUnhandledError(error);
                        }
                    },
                    error: (error) => reportUnhandledError(error),
                });
                destination.add(input);
                source.subscribe(input);
            }, "local");
            // 來源標記由 sync 檢查，不能以包裝掩蓋錯誤標記。
            if (source.runtimeSyncKind !== "local") {
                reportUnhandledError(new Error("分段同步需要本地來源。"));
                subscriber.unsubscribe();
                return;
            }
            const received = outgoing
                .pipe(
                    sync(
                        player,
                        { prefix, encode: (value) => value, decode: (value) => value },
                        natives,
                    ),
                )
                .subscribe((text) => {
                    const fragment = decodeFragment(text);
                    if (fragment === undefined) return;
                    const data = receiver.accept(fragment);
                    if (data === undefined) return;
                    try {
                        subscriber.next(decode(data));
                    } catch (error) {
                        reportUnhandledError(error);
                    }
                });
            subscriber.add(received);
            if (received.closed) subscriber.unsubscribe();
        }, "sync");
}
