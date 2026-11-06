import { Subject, Clock } from "../../src/shared/lib/rxwc3";
import { ChatEvent } from "@shared/lib/wc3-def";
import { createLocalFileIo } from "../../src/shared/lib/file-io";
import { installSaveChat, SaveCodec, SaveParticipant } from "@features/save";
import { FakeSyncNetwork } from "../rxwc3/fake-sync-natives";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";
import { fakeFileIo } from "../file-io/fake-file-io";

export function setupSave(
    codec?: SaveCodec,
    participants?: (this: void, owner: player, client: number) => readonly SaveParticipant[],
) {
    const network = new FakeSyncNetwork();
    const chat = new Subject<ChatEvent>();
    const files = [fakeFileIo(), fakeFileIo()];
    const drivers = [new FakeClockDriver(), new FakeClockDriver()];
    const names = new Map<player, string>([
        [network.players[0], " 玩家Alice#1234 "],
        [network.players[1], "玩家Bob#5678"],
    ]);
    const displays: { client: number; player: player; text: string }[] = [];
    const services = files.map((file, client) =>
        installSaveChat(
            chat,
            network.players,
            createLocalFileIo(file.natives),
            {
                playerName: (player) => names.get(player)!,
                display: (player, text) => {
                    displays.push({ client, player, text });
                },
            },
            network.client(client),
            new Clock(drivers[client]),
            codec,
            participants?.(network.players[0], client),
        ),
    );
    return {
        network,
        files,
        drivers,
        services,
        names,
        displays,
        command: (message: string, id = 0) => chat.next({ player: network.players[id], message }),
        close: () => {
            for (const service of services) service.owner.unsubscribe();
        },
    };
}
