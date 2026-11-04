import { ItemInstance } from "@entities/item";
import { nativeItemTypes } from "@features/equipment";
import { ItemCarrierNatives } from "@shared/wc3-def";
import { logger } from "@shared/logger";

interface Entry {
    readonly data: ItemInstance;
    readonly handle: item;
    ground: boolean;
}
/** 共同流程管理載體。資料與 handle 必須同時登錄或移除。 */
export class NativeItemRegistry {
    private readonly entries = new Map<number, Entry>();
    private readonly stop: (this: void) => void;
    private destroyed = false;
    public constructor(
        private readonly natives: ItemCarrierNatives,
        private readonly hero: unit,
        private readonly accept: (this: void, item: ItemInstance) => boolean,
        private readonly full: (this: void) => void,
    ) {
        natives.ensureInventory(hero);
        this.stop = natives.onPickup(hero, (handle) => {
            try {
                this.pickup(handle);
            } catch (error) {
                logger.error(error);
            }
        });
    }
    public get size(): number {
        return this.entries.size;
    }
    public get(id: number): ItemInstance | undefined {
        return this.entries.get(id)?.data;
    }
    public add(data: ItemInstance): void {
        if (this.destroyed) throw new Error("原生物品登錄已關閉。");
        if (
            !Number.isInteger(data.id) ||
            data.id < 1 ||
            data.id > 16777215 ||
            this.entries.has(data.id)
        )
            throw new Error("物品編號無效或重複。");
        const code = (nativeItemTypes as Readonly<Record<string, string>>)[data.baseId];
        if (code === undefined) throw new Error("物品基底沒有原生類型。");
        const handle = this.natives.createItem(
            code,
            this.natives.unitX(this.hero),
            this.natives.unitY(this.hero),
        );
        if (handle === undefined) throw new Error("無法建立原生物品。");
        try {
            this.natives.setUserData(handle, data.id);
            this.natives.setVisible(handle, false);
        } catch (error) {
            this.natives.removeItem(handle);
            throw error;
        }
        this.entries.set(data.id, { data, handle, ground: false });
    }
    public drop(id: number): boolean {
        const entry = this.entries.get(id);
        if (entry === undefined || entry.ground) return false;
        this.natives.setPosition(
            entry.handle,
            this.natives.unitX(this.hero),
            this.natives.unitY(this.hero),
        );
        this.natives.setVisible(entry.handle, true);
        entry.ground = true;
        return true;
    }
    private pickup(handle: item): void {
        const entry = this.entries.get(this.natives.getUserData(handle));
        if (entry === undefined || entry.handle !== handle) return;
        this.natives.removeFromUnit(this.hero, handle);
        if (!entry.ground) {
            this.natives.setVisible(handle, false);
            return;
        }
        this.natives.setVisible(handle, false);
        let accepted: boolean;
        try {
            accepted = this.accept(entry.data);
        } catch (error) {
            this.natives.setVisible(handle, true);
            throw error;
        }
        if (!accepted) {
            this.natives.setPosition(
                handle,
                this.natives.unitX(this.hero),
                this.natives.unitY(this.hero),
            );
            this.natives.setVisible(handle, true);
            this.full();
            return;
        }
        entry.ground = false;
    }
    public remove(id: number): void {
        const entry = this.entries.get(id);
        if (entry === undefined) return;
        this.natives.removeItem(entry.handle);
        this.entries.delete(id);
    }
    public clear(): void {
        for (const id of [...this.entries.keys()]) this.remove(id);
    }
    public replace(items: readonly ItemInstance[]): void {
        this.clear();
        try {
            for (const item of items) this.add(item);
        } catch (error) {
            this.clear();
            throw error;
        }
    }
    public destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stop();
        this.clear();
    }
}
