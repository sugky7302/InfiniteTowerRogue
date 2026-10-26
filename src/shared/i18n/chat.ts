import { ChatEvent } from "../wc3-def/events";
import { SyncNatives } from "../wc3-def/natives";
import { wc3SyncNatives } from "../wc3-def/wc3-natives";
import { Observable } from "../rxwc3/core/observable";
import { Subscription } from "../rxwc3/core/subscription";
import { filter } from "../rxwc3/operators/filter";
import { forLocalPlayer } from "../rxwc3/sync/for-local-player";
import { isLocale } from "./locale";
import { I18n } from "./translation";

/** 必須在共同流程訂閱及取消。顯示回呼不得建立原生 handle。 */
export function installLanguageChat(
    service: I18n,
    chat: Observable<ChatEvent>,
    players: readonly player[],
    display: (this: void, text: string) => void,
    natives: SyncNatives = wc3SyncNatives,
): Subscription {
    const owner = new Subscription();
    for (const player of players) {
        owner.add(
            chat
                .pipe(
                    filter(
                        (event) =>
                            event.player === player &&
                            (event.message === "-lang" || event.message.indexOf("-lang ") === 0),
                    ),
                    forLocalPlayer(player, natives),
                )
                .subscribe((event) => {
                    const code = event.message.slice(5).trim();
                    if (isLocale(code)) {
                        const written = service.selectLanguage(code);
                        if (written !== undefined) display(`語言偏好寫檔結果：${written.status}。`);
                    } else display(service.t("language.available"));
                }),
        );
    }
    return owner;
}
