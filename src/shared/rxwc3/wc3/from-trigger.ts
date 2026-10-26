import { Observable } from "../core/observable";
import { reportUnhandledError } from "../core/config";
import { TriggerHandle, TriggerNatives } from "./event-natives";
import { wc3EventNatives } from "./wc3-event-natives";

// 同步來源：僅接受同步事件的註冊函式。實際同步性取決於呼叫者所註冊的 WC3 事件。
// 本地事件須等 M4 的本地 API；不得在本地分支訂閱此來源。
export function fromTrigger<T>(
  register: (this: void, trigger: TriggerHandle) => void,
  read: (this: void) => T,
  natives: TriggerNatives = wc3EventNatives,
): Observable<T> {
  return new Observable<T>(subscriber => {
    const trigger = natives.createTrigger();
    // 先連接清理，註冊失敗或同步取消時仍會銷毀。
    subscriber.add(() => natives.destroyTrigger(trigger));
    natives.addAction(trigger, () => {
      try {
        if (!subscriber.closed) subscriber.next(read());
      } catch (error) {
        reportUnhandledError(error);
      }
    });
    register(trigger);
  });
}
