import {
    forLocalPlayer,
    Local,
    Observable,
    of,
    Signal,
    sync,
    Sync,
    toSignal,
} from "../../src/shared/rxwc3";

function acceptsSync(source: Observable<number, Sync>): void {}
function acceptsLocal(source: Observable<number, Local>): void {}
declare const raw: player;
// 比照 M3 使用包裝物件的公開結構，避免載入 WC3 全域型別與 DOM 衝突。
declare const wrapped: { readonly handle: player };
const options = {
    prefix: "m4.types",
    encode: (v: number) => `${v}`,
    decode: (v: string) => Number(v),
};
const local = of(1).pipe(forLocalPlayer(raw));
const wrappedLocal = of(1).pipe(forLocalPlayer(wrapped));
acceptsLocal(local);
acceptsLocal(wrappedLocal);
// @ts-expect-error 本地輸出不可傳入同步入口。
acceptsSync(local);
// @ts-expect-error sync 不接受同步串流。
of(1).pipe(sync(raw, options));
// @ts-expect-error forLocalPlayer 只接受同步串流。
local.pipe(forLocalPlayer(raw));
acceptsSync(local.pipe(sync(raw, options)));
acceptsSync(wrappedLocal.pipe(sync(wrapped, options)));
// @ts-expect-error prefix 必須明確提供。
sync(raw, { encode: options.encode, decode: options.decode });
const forcedLocal: Signal<number, Local> = toSignal(of(1), 0, { syncKind: "local" });
const forcedSync: Signal<number, Sync> = toSignal(local, 0, { syncKind: "sync" });
