import { Observable } from "../core/observable";
import { operatorSubscriber } from "../core/subscriber";
import { wc3SyncNatives } from "@shared/wc3-def/wc3-natives";
import { PlayerInput, unwrapPlayer } from "@shared/wc3-def/inputs";
import { SyncNatives } from "@shared/wc3-def/natives";
import { Local, Sync } from "./types";

/** 在共同流程訂閱來源；只有指定玩家的用戶端轉送值。本地值只用於介面。 */
export function forLocalPlayer<T>(player: PlayerInput, natives: SyncNatives = wc3SyncNatives):
  (this: void, source: Observable<T, Sync>) => Observable<T, Local> {
  const owner = unwrapPlayer(player);
  return source => new Observable<T, Local>(subscriber => {
    source.subscribe(operatorSubscriber<T>(subscriber, value => {
      if (natives.getLocalPlayer() === owner) subscriber.next(value);
    }));
  }, "local");
}
