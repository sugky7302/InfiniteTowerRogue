/** 尺寸由 inventory.fdf 定義。此處只計算位置。 */
export const inventorySlots = ["main-hand", "off-hand", "armor", "tool"] as const;

export function bagPosition(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= 90)
        throw new Error("背包格子必須為 0～89。");
    const page = Math.floor(index / 30);
    const row = Math.floor((index % 30) / 6);
    const column = index % 6;
    return { page, row, column, x: 0.46 + column * 0.049, y: 0.54 - row * 0.049 };
}

export function equipmentPosition(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= 4)
        throw new Error("穿戴位置必須為 0～3。");
    return { x: index % 2 === 0 ? 0.032 : 0.168, y: index < 2 ? 0.51 : 0.43 };
}

export function previewPath(angle: number): string {
    if (!Number.isInteger(angle) || angle < 0 || angle >= 16)
        throw new Error("預覽角度必須為 0～15。");
    return "ui\\itr-hero-preview-" + (angle < 10 ? "0" : "") + angle + ".mdl";
}

export function rotatePreview(angle: number, direction: -1 | 1): number {
    return (angle + direction + 16) % 16;
}
