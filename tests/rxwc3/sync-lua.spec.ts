import {
  config, finalize, forLocalPlayer, localSignal, map, merge, mergeMap, Observable, of, share,
  Subject, sync, switchMap, take, toObservable, toSignal,
} from "../../src/shared/rxwc3";
import { FakeSyncNetwork } from "./fake-sync-natives";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** 相同測試在 Node 與轉譯後的 Lua 5.3 中執行。 */
export function verifySync(): number {
  let groups = 0;
  const previous = config.onUnhandledError;
  let errors = 0;
  config.onUnhandledError = () => { errors++; };
  try {
    const local = toObservable(localSignal(3));
    const chain = local.pipe(map(v => v + 1), take(1), share());
    check(chain.runtimeSyncKind === "local" && merge(of(1), chain).runtimeSyncKind === "local" &&
      of(1).runtimeSyncKind === "sync" && toSignal(chain, 0).syncKind === "local", "本地標記沒有傳遞。");
    groups++;

    let values = 0;
    of(1).pipe(mergeMap(() => local)).subscribe(() => { values++; });
    of(1).pipe(switchMap(() => local)).subscribe(() => { values++; });
    check(errors === 2 && values === 0, "未宣告的本地內層沒有被拒絕。");
    const declared = of(1).pipe(mergeMap(() => local, "local"), switchMap(v => of(v)));
    const declaredSub = declared.subscribe(v => { values += v; });
    check(declared.runtimeSyncKind === "local" && values === 3, "明確的本地內層沒有送出。");
    declaredSub.unsubscribe();
    groups++;

    const network = new FakeSyncNetwork(), a = network.client(0), b = network.client(1);
    let localA = 0, localB = 0;
    of(7).pipe(forLocalPlayer(network.players[0], a)).subscribe(v => { localA += v; });
    of(7).pipe(forLocalPlayer({ handle: network.players[0] }, b)).subscribe(v => { localB += v; });
    check(localA === 7 && localB === 0, "本地玩家篩選錯誤。");
    groups++;

    const sourceA = new Subject<string, "local">(undefined, "local");
    const sourceB = new Subject<string, "local">(undefined, "local");
    const options = { prefix: "m4.lua", encode: (v: string) => v, decode: (v: string) => `收到：${v}` };
    const receivedA: string[] = [], receivedB: string[] = [];
    const subA = sourceA.pipe(sync(network.players[0], options, a)).subscribe(v => receivedA.push(v));
    const subB = sourceB.pipe(sync(network.players[0], options, b)).subscribe(v => receivedB.push(v));
    sourceA.next("座標"); sourceB.next("不應送出");
    check(a.sends === 1 && b.sends === 0 && receivedA.length === 0 && receivedB.length === 0,
      "同步送出沒有依玩家篩選或沒有網路延遲。");
    sourceA.complete(); sourceB.complete();
    network.flush();
    check(receivedA[0] === "收到：座標" && receivedB[0] === receivedA[0] && !subA.closed && !subB.closed,
      "完成來源後遺失在途資料。");
    groups++;

    const oversized = new Observable<string, "local">(s => { s.next("文".repeat(81)); }, "local");
    const oversub = oversized.pipe(sync(network.players[0], { ...options, prefix: "m4.limit" }, a)).subscribe();
    check(errors === 3 && a.sends === 1, "超長資料仍被送出。");
    oversub.unsubscribe();
    groups++;

    const duplicate = sourceA.pipe(sync(network.players[0], options, a)).subscribe();
    check(duplicate.closed && errors === 4 && a.creates === 2, "重複 prefix 沒有被拒絕。");
    subA.unsubscribe(); subB.unsubscribe(); subA.unsubscribe();
    check(a.destroys === 2 && b.destroys === 1, "觸發器沒有釋放或重複釋放。");
    groups++;

    const broken = new Subject<string, "local">(undefined, "local");
    let failEncode = true, failDecode = true, total = 0;
    const codecSub = broken.pipe(sync(network.players[0], {
      prefix: "m4.codec",
      encode: value => { if (failEncode) throw new Error("預期的編碼錯誤。"); return value; },
      decode: value => { if (failDecode) throw new Error("預期的解碼錯誤。"); return value; },
    }, a)).subscribe(() => { total++; });
    broken.next("一"); failEncode = false; broken.next("二"); network.flush();
    failDecode = false; broken.next("三"); network.flush();
    check(errors === 6 && total === 1 && !codecSub.closed, "編碼或解碼錯誤沒有隔離。");
    codecSub.unsubscribe();
    groups++;

    const before = a.creates;
    of(1).pipe(forLocalPlayer(network.players[0], a)).subscribe(() => {
      sourceA.pipe(sync(network.players[0], { ...options, prefix: "m4.local" }, a)).subscribe();
    });
    check(errors === 7 && a.creates === before, "本地回呼建立了同步觸發器。");
    groups++;

    const completed = new Observable<number, "local">(subscriber => subscriber.complete(), "local");
    completed.pipe(finalize(() => {
      sourceA.pipe(sync(network.players[0], { ...options, prefix: "m4.cleanup" }, a)).subscribe();
    })).subscribe();
    check(errors === 8 && a.creates === before, "同步完成後加入的本地清理遺失執行環境。");
    groups++;
    return groups;
  } finally { config.onUnhandledError = previous; }
}
