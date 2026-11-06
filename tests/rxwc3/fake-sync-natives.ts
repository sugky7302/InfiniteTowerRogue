import { SyncNatives } from "../../src/shared/lib/rxwc3";

interface FakeSyncTrigger extends trigger {
    action?: (this: void) => void;
    player?: player;
    prefix?: string;
    destroyed: boolean;
}
interface Packet {
    player: player;
    prefix: string;
    data: string;
}

/** send 只排入佇列；flush 才模擬全部用戶端收到事件。 */
export class FakeSyncNetwork {
    public readonly players = [{} as player, {} as player];
    public readonly clients: FakeSyncNatives[] = [];
    public readonly packets: Packet[] = [];

    public client(id: number): FakeSyncNatives {
        const client = new FakeSyncNatives(this, this.players[id]);
        this.clients.push(client);
        return client;
    }

    public flush(): void {
        while (this.packets.length > 0) {
            const packet = this.packets.shift()!;
            for (const client of this.clients) {
                for (const trigger of client.triggers) {
                    if (
                        !trigger.destroyed &&
                        trigger.player === packet.player &&
                        trigger.prefix === packet.prefix
                    ) {
                        client.data = packet.data;
                        trigger.action?.();
                    }
                }
            }
        }
    }
}

export class FakeSyncNatives implements SyncNatives {
    public readonly triggers: FakeSyncTrigger[] = [];
    public creates = 0;
    public destroys = 0;
    public sends = 0;
    public data = "";
    public failRegister = false;
    public failRead = false;
    public rejectSend = false;
    public throwSend = false;

    public constructor(
        public readonly network: FakeSyncNetwork,
        public readonly player: player,
    ) {}
    public getLocalPlayer(): player {
        return this.player;
    }
    public createTrigger(): trigger {
        const trigger = { destroyed: false } as FakeSyncTrigger;
        this.triggers.push(trigger);
        this.creates++;
        return trigger;
    }
    public destroyTrigger(trigger: trigger): void {
        (trigger as FakeSyncTrigger).destroyed = true;
        this.destroys++;
    }
    public addAction(trigger: trigger, callback: (this: void) => void): void {
        (trigger as FakeSyncTrigger).action = callback;
    }
    public registerSync(trigger: trigger, player: player, prefix: string): void {
        if (this.failRegister) throw new Error("預期的同步註冊錯誤。");
        const target = trigger as FakeSyncTrigger;
        target.player = player;
        target.prefix = prefix;
    }
    public sendSync(prefix: string, data: string): boolean {
        if (this.throwSend) throw new Error("預期的原生送出錯誤。");
        if (this.rejectSend) return false;
        this.sends++;
        this.network.packets.push({ player: this.player, prefix, data });
        return true;
    }
    public readSyncData(): string {
        if (this.failRead) throw new Error("預期的同步讀取錯誤。");
        return this.data;
    }
}
