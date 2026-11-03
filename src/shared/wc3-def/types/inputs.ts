// Handle 型別（unit、player 等）來自 war3-types-strict 的全域宣告。

/** 原生 handle，或 w3ts 的包裝物件（有 `handle` 欄位，例如 `Unit`）。 */
export type UnitInput = unit | { readonly handle: unit };
/** 原生 handle，或 w3ts 的包裝物件（有 `handle` 欄位，例如 `MapPlayer`）。 */
export type PlayerInput = player | { readonly handle: player };

// WC3 原生 handle 是 userdata，`typeof` 不是 "object"。只有包裝物件可以索引 `handle` 欄位。
export function unwrapUnit(input: UnitInput): unit {
    return typeof input === "object" && "handle" in input ? input.handle : (input as unit);
}

export function unwrapPlayer(input: PlayerInput): player {
    return typeof input === "object" && "handle" in input ? input.handle : (input as player);
}
