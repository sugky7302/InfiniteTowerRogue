export interface ItemCarrierNatives {
    createItem(typeCode: string, x: number, y: number): item | undefined;
    removeItem(target: item): void;
    setVisible(target: item, visible: boolean): void;
    setPosition(target: item, x: number, y: number): void;
    setUserData(target: item, id: number): void;
    getUserData(target: item): number;
    removeFromUnit(owner: unit, target: item): void;
    unitX(target: unit): number;
    unitY(target: unit): number;
    ensureInventory(target: unit): void;
    onPickup(target: unit, callback: (this: void, target: item) => void): (this: void) => void;
}
