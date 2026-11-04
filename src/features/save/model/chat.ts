import { LocalFileIo, FileReadStatus } from "@shared/file-io";
import { ChatEvent, PlayerNatives, SyncNatives } from "@shared/wc3-def";
import {
    Observable,
    Subject,
    Subscription,
    filter,
    forLocalPlayer,
    syncChunked,
    Clock,
    fragmentNumber,
} from "@shared/rxwc3";
import { SaveCodec, maxSaveCodeLength } from "./codec";
import { SaveData } from "./format";
import { createDemoCodec, initialDemoData, changeDemo } from "./demo";
import { loadCommands, ManualSaveInput } from "./manual-input";
import { SaveParticipant } from "./participant";
import { logger } from "@shared/logger";

/** 存檔流程需要的玩家原生操作。 */
export type SaveNatives = Pick<PlayerNatives, "playerName" | "display">;

export const saveFilePath = "InfiniteTowerRogue\\save.pld";
export const readableSavePath = "InfiniteTowerRogue\\save-commands.pld";

interface SaveRead {
    request: number;
    code: string;
}

/** 全部用戶端共同建立與取消。只有寫檔、讀檔、顯示位於本地訂閱。 */
export function installSaveChat(
    chat: Observable<ChatEvent>,
    players: readonly player[],
    files: LocalFileIo,
    natives: SaveNatives,
    network: SyncNatives,
    clock: Clock,
    codec: SaveCodec | undefined = undefined,
    participants: readonly SaveParticipant[] = [],
) {
    const saveCodec = codec ?? createDemoCodec(participants);
    const owner = new Subscription();
    const states = new Map<player, SaveData>();
    for (let index = 0; index < players.length; index++) {
        const player = players[index];
        const prefix = `save.file.${index}`;
        let requestSequence = 0;
        let pendingRead: Subscription | undefined;
        const cancelRead = (): void => {
            pendingRead?.unsubscribe();
            pendingRead = undefined;
        };
        owner.add(cancelRead);
        states.set(player, initialDemoData());
        const messages = new Subject<string>();
        owner.add(
            messages
                .pipe(forLocalPlayer(player, network))
                .subscribe((text) => natives.display(player, text)),
        );
        const invalid = (): void => messages.next("存檔碼無效。");
        const manual = new ManualSaveInput(clock, () =>
            messages.next("存檔碼無效。分段未完成或已逾時，請重新輸入全部片段。"),
        );
        owner.add(() => manual.reset());
        const apply = (code: string, automatic: boolean): void => {
            const data = saveCodec.decode(code, natives.playerName(player));
            if (data === undefined) {
                messages.next(
                    automatic && participants.length === 0
                        ? "存檔碼無效。請改用 -load <存檔碼>。"
                        : "存檔碼無效。",
                );
                return;
            }
            const actions: ((this: void) => void)[] = [];
            try {
                for (const participant of participants) {
                    const values = data[participant.section.name];
                    const action =
                        values === undefined ? undefined : participant.prepare(player, values);
                    if (action === undefined) {
                        invalid();
                        return;
                    }
                    actions.push(action);
                }
            } catch (error) {
                logger.error(error);
                invalid();
                return;
            }
            for (const action of actions) action();
            states.set(player, data);
            messages.next("存檔已載入。");
        };
        const saves = new Subject<string>();
        owner.add(
            saves.pipe(forLocalPlayer(player, network)).subscribe((code) => {
                const written = files.write(saveFilePath, code);
                const readable = files.writeReadable(readableSavePath, loadCommands(code));
                natives.display(
                    player,
                    `存檔檔案 ${written.status}。指令檔案 ${readable.status}。file-io 只能回報已送出。`,
                );
                natives.display(player, `CustomMapData\\${saveFilePath}`);
                natives.display(player, `存檔碼 ${code}`);
            }),
        );
        const reads = new Subject<number>();
        const localReads = new Observable<SaveRead, "local">(
            (subscriber) =>
                reads.pipe(forLocalPlayer(player, network)).subscribe((request) => {
                    const result = files.read(saveFilePath);
                    subscriber.next({
                        request,
                        code:
                            result.status === FileReadStatus.Read &&
                            result.data.length <= maxSaveCodeLength
                                ? result.data
                                : "",
                    });
                }),
            "local",
        );
        owner.add(
            localReads
                .pipe(
                    syncChunked(
                        player,
                        {
                            prefix,
                            encode: (value) => `${value.request}:${value.code}`,
                            decode: (value) => {
                                const end = value.indexOf(":");
                                return {
                                    request: fragmentNumber(value.slice(0, end)) ?? 0,
                                    code: value.slice(end + 1),
                                };
                            },
                            clock,
                            // 範例刻意使用較小片段，短存檔也能在 V4 驗證多段傳輸。
                            chunkBytes: 20,
                        },
                        network,
                    ),
                )
                .subscribe((read) => {
                    if (pendingRead === undefined || read.request !== requestSequence) return;
                    cancelRead();
                    apply(read.code, true);
                }),
        );
        owner.add(
            chat.pipe(filter((event) => event.player === player)).subscribe((event) => {
                const message = event.message.trim();
                if (message === "-save") {
                    const data: SaveData = { ...states.get(player)! };
                    try {
                        for (const participant of participants) {
                            const values = participant.collect(player);
                            if (values === undefined) {
                                invalid();
                                return;
                            }
                            data[participant.section.name] = values;
                        }
                    } catch (error) {
                        logger.error(error);
                        invalid();
                        return;
                    }
                    const code = saveCodec.encode(data, natives.playerName(player));
                    if (code === undefined) invalid();
                    else saves.next(code);
                } else if (message === "-load") {
                    manual.reset();
                    cancelRead();
                    if (requestSequence === 1048575) {
                        messages.next("讀檔次數已達上限。請改用 -load <存檔碼>。");
                        return;
                    }
                    requestSequence++;
                    pendingRead = clock.scheduleTicks(15000, () => {
                        pendingRead = undefined;
                        messages.next(
                            "讀檔分段未完成或已逾時。請重試 -load 或改用 -load <存檔碼>。",
                        );
                    });
                    reads.next(requestSequence);
                } else if (message.indexOf("-load ") === 0) {
                    cancelRead();
                    const text = message.slice(6).trim();
                    const first = text.split(" ")[0];
                    if (first.indexOf("/") >= 0) {
                        const complete = manual.accept(text);
                        if (complete !== undefined) apply(complete, false);
                    } else {
                        manual.reset();
                        apply(text, false);
                    }
                } else if (message === "-save-demo" || message.indexOf("-save-demo ") === 0) {
                    const arguments_ = message
                        .slice(10)
                        .trim()
                        .split(" ")
                        .filter((word) => word !== "");
                    if (arguments_.length === 1 && arguments_[0] === "show") {
                        const data = states.get(player)!.demo;
                        messages.next(
                            `玩家原始名稱 [${natives.playerName(player)}]。等級 ${data.level}，金錢 ${data.gold}，物品 ${(data.items as number[]).join(",")}。`,
                        );
                    } else if (changeDemo(states.get(player)!, arguments_))
                        messages.next("範例資料已修改。");
                    else
                        messages.next(
                            "指令格式 -save-demo level 1..100、gold 0..1000000、item 1..6 0..3、show。",
                        );
                }
            }),
        );
    }
    return { owner, states };
}
