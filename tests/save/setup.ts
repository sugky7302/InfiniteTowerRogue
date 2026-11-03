import { Subject, Clock } from "../../src/shared/rxwc3";
import { ChatEvent } from "../../src/shared/wc3-def/events";
import { createLocalFileIo } from "../../src/shared/file-io";
import { installSaveChat, SaveCodec } from "../../src/feature/save";
import { FakeSyncNetwork } from "../rxwc3/fake-sync-natives";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";
import { fakeFileIo } from "../file-io/fake-file-io";

export function setupSave(codec?: SaveCodec) {
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
