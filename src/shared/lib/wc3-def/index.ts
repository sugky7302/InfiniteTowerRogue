// WC3 原生函式介面的公開 API。依 WC3 概念分資料夾；每個資料夾放介面與 WC3 實作。
// 介面只包裝原生操作，不含遊戲規則。Node 測試注入假的實作。

export * from "./types/inputs";
export * from "./types/events";
export * from "./trigger/trigger-natives";
export * from "./trigger/wc3-trigger-natives";
export * from "./timer/timer-natives";
export * from "./timer/wc3-timer-natives";
export * from "./unit/unit-natives";
export * from "./unit/wc3-unit-natives";
export * from "./unit/unit-action-natives";
export * from "./unit/wc3-unit-action-natives";
export * from "./ability/ability-natives";
export * from "./ability/wc3-ability-natives";
export * from "./effect/effect-natives";
export * from "./effect/wc3-effect-natives";
export * from "./item/item-natives";
export * from "./item/wc3-item-natives";
export * from "./player/player-natives";
export * from "./player/wc3-player-natives";
export * from "./random/random-natives";
export * from "./random/wc3-random-natives";
export * from "./file/file-natives";
export * from "./file/wc3-file-natives";
export * from "./item/item-carrier-natives";
export * from "./item/wc3-item-carrier-natives";
export * from "./frame/frame-natives";
export * from "./frame/wc3-frame-natives";
