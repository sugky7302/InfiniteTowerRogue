import { reportUnhandledError } from "../core/config";
import { Observable } from "../core/observable";
import { Subscriber } from "../core/subscriber";
import { isLocalSignalExecution } from "../signal/runtime";
import { wc3SyncNatives } from "@shared/wc3-def/wc3-natives";
import { isLocalExecution } from "./execution";
import { validSyncData, validSyncPrefix } from "./limits";
import { PlayerInput, unwrapPlayer } from "@shared/wc3-def/inputs";
import { SyncNatives } from "@shared/wc3-def/natives";
import { Local, Sync } from "./types";

export interface SyncOptions<T> {
  /** 全部用戶端使用相同明確值。限 1 至 32 個英數字、底線、連字號或點號。 */
  prefix: string;
  encode: (this: void, value: T) => string;
  decode: (this: void, data: string) => T;
}

const usedPrefixes = new Map<SyncNatives, Set<string>>();

/**
 * 本地資料經網路送達全部用戶端。資料限 240 個 UTF-8 位元組，不分段。
 * 訂閱與取消必須由全部用戶端在共同流程執行。不得在本地回呼中建立或取消。
 * 可辨識 RxWC3 的本地回呼，不能辨識呼叫端自行使用 GetLocalPlayer 的分支。
 * 可辨識的本地取消只回報誤用，仍執行清理；檢查不能補救不同步。
 * 每個 prefix 只可訂閱一次。多個訂閱者請使用 share；取消後也不可重用 prefix。
 * 本地來源完成或發生錯誤不結束接收器，避免丟失在途資料與本地刪除觸發器。
 * 呼叫端須在共同流程取消。不得用於傷害事件內的即時修正。
 */
export function sync<T>(player: PlayerInput, options: SyncOptions<T>, natives: SyncNatives = wc3SyncNatives):
  (this: void, source: Observable<T, Local>) => Observable<T, Sync> {
  const owner = unwrapPlayer(player);
  // 複製設定，避免訂閱後修改 prefix 或編碼器。
  const { prefix, encode, decode } = options;
  return source => new Observable<T, Sync>(subscriber => {
    if (isLocalExecution() || isLocalSignalExecution()) {
      reportUnhandledError(new Error("sync 必須在全部用戶端的共同流程訂閱。"));
      subscriber.unsubscribe();
      return;
    }
    if (source.runtimeSyncKind !== "local" || !validSyncPrefix(prefix)) {
      reportUnhandledError(new Error("sync 需要本地標記與有效的明確 prefix。"));
      subscriber.unsubscribe();
      return;
    }
    let prefixes = usedPrefixes.get(natives);
    if (prefixes === undefined) { prefixes = new Set(); usedPrefixes.set(natives, prefixes); }
    if (prefixes.has(prefix)) {
      reportUnhandledError(new Error("sync 的 prefix 已經使用，不可重複訂閱。"));
      subscriber.unsubscribe();
      return;
    }
    prefixes.add(prefix);
    const trigger = natives.createTrigger();
    // 註冊前連接清理，讓註冊或來源建立失敗時也可釋放。
    subscriber.add(() => {
      if (isLocalExecution() || isLocalSignalExecution()) {
        reportUnhandledError(new Error("sync 的取消必須在全部用戶端的共同流程執行。"));
      }
      natives.destroyTrigger(trigger);
    });
    natives.addAction(trigger, () => {
      if (subscriber.closed) return;
      try {
        const data = natives.readSyncData();
        if (!validSyncData(data)) throw new Error("sync 收到無效資料或資料超過 240 個位元組。");
        subscriber.next(decode(data));
      } catch (error) { reportUnhandledError(error); }
    });
    natives.registerSync(trigger, owner, prefix);
    const input = new Subscriber<T>({
      next: value => {
        if (subscriber.closed || natives.getLocalPlayer() !== owner) return;
        try {
          const data = encode(value);
          if (!validSyncData(data)) throw new Error("sync 資料超過 240 個位元組或含有 NUL，未送出。");
          if (!natives.sendSync(prefix, data)) throw new Error("sync 原生函式拒絕送出資料。");
        } catch (error) { reportUnhandledError(error); }
      },
      error: error => reportUnhandledError(error),
    });
    subscriber.add(input);
    source.subscribe(input);
  }, "sync");
}
