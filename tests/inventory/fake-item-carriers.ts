import { ItemCarrierNatives } from "@shared/lib/wc3-def";

export interface FakeItem {
    readonly handle: item;
    readonly code: string;
    id: number;
    visible: boolean;
    carried: boolean;
    x: number;
    y: number;
}
export function fakeItemCarriers() {
    const live = new Map<item, FakeItem>();
    const removed: item[] = [];
    const actions: string[] = [];
    let listener: ((this: void, target: item) => void) | undefined;
    let creates = 0;
    let failCreateAt = -1;
    let failUserData = false;
    let inventory = 0;
    const requireItem = (target: item): FakeItem => {
        const value = live.get(target);
        if (value === undefined) throw new Error("假原生物品不存在。");
        return value;
    };
    const natives: ItemCarrierNatives = {
        createItem(code, x, y) {
            creates++;
            actions.push("建立");
            if (creates === failCreateAt) return undefined;
            const handle = {} as item;
            live.set(handle, { handle, code, id: 0, visible: true, carried: false, x, y });
            return handle;
        },
        removeItem(target) {
            requireItem(target);
            live.delete(target);
            removed.push(target);
            actions.push("移除");
        },
        setVisible(target, visible) {
            requireItem(target).visible = visible;
            actions.push(visible ? "顯示" : "隱藏");
        },
        setPosition(target, x, y) {
            const value = requireItem(target);
            value.x = x;
            value.y = y;
            actions.push("移動");
        },
        setUserData(target, id) {
            if (failUserData) throw new Error("假使用者資料寫入失敗。");
            requireItem(target).id = id;
        },
        getUserData: (target) => requireItem(target).id,
        removeFromUnit(target, handle) {
            requireItem(handle).carried = false;
            actions.push("移出物品欄");
        },
        unitX: () => 120,
        unitY: () => -80,
        ensureInventory: () => {
            inventory++;
        },
        onPickup(target, callback) {
            listener = callback;
            return () => {
                listener = undefined;
            };
        },
    };
    return {
        natives,
        live,
        removed,
        actions,
        inventory: () => inventory,
        stopped: () => listener === undefined,
        failCreate: (offset = 1) => {
            failCreateAt = creates + offset;
        },
        failUserData: () => {
            failUserData = true;
        },
        pickup: (handle: item) => {
            requireItem(handle).carried = true;
            actions.length = 0;
            listener?.(handle);
        },
        byId: (id: number) => [...live.values()].find((entry) => entry.id === id)!,
    };
}
