import { logger } from "../logger";
import { Subscription } from "../rxwc3/core/subscription";
import { filter } from "../rxwc3/operators/filter";
import { localEffect } from "../rxwc3/signal";
import { onPlayerChat } from "../rxwc3/wc3/events";
import { wc3FileNatives } from "@shared/lib/wc3-def";
import { wc3I18nNatives } from "./natives";
import { installLanguageChat } from "./chat";
import { createObjectText, ObjectTextData } from "./object-text";
import { getI18n } from "./translation";
import { createLocalFileIo } from "../file-io";
import { LANGUAGE_PREFERENCE_PATH } from "./preference";

// 此宣告也讓 Node 型別檢查不需要載入建置轉換器的全域型別。
declare function compiletime<T>(
    this: void,
    callback: (
        this: void,
        context: {
            objectData: import("war3-objectdata-th/dist/cjs").ObjectData;
        },
    ) => T,
): T;

// 轉換器先處理主程式的相依模組，再處理主程式並儲存物件資料。
// 此回呼只建立範例。建置腳本在全部物件儲存後產生翻譯表。
compiletime(({ objectData }) => {
    const root = require("process").cwd();
    require(root + "/scripts/i18n-objects.cjs").createExample(objectData, root);
});
// scripts/utils.ts 在 Lua 模組初始化前寫入此表，不需要執行時檔案讀取。
declare const __i18nObjectData: ObjectTextData;

/** 全部初始化、物件建立、聊天訂閱與停止清理都在共同流程執行。 */
export function runI18nExample(): void {
    const owner = new Subscription();
    try {
        const files = createLocalFileIo(wc3FileNatives);
        const service = getI18n(files);
        logger.info(`語言偏好讀檔結果：${service.preference?.result.status ?? "未讀取"}。`);
        logger.info(`偏好檔相對路徑：CustomMapData\\${LANGUAGE_PREFERENCE_PATH}`);
        logger.info(`啟動採用語言：${service.language()}`);
        logger.info(`自動層技能編輯器名稱：${GetObjectName(FourCC("A0I1")) ?? "無法讀取"}`);
        const objects = createObjectText(service, __i18nObjectData, wc3I18nNatives);
        owner.add(() => objects.destroy());
        owner.add(wc3I18nNatives.watchUnits((target) => objects.trackUnit(target)));
        wc3I18nNatives.visitItems((target) => objects.trackItem(target));
        const players: player[] = [];
        const heroes: unit[] = [];
        const items: item[] = [];
        const create = (player: player): void => {
            const hero = CreateUnit(
                player,
                FourCC("H0I1"),
                300 + GetPlayerId(player) * 260,
                0,
                270,
            )!;
            heroes.push(hero);
            // 進入事件已登記新單位。再次登記可涵蓋原生事件的送出時序，Set 會去除重複值。
            objects.trackUnit(hero);
            UnitAddAbility(hero, FourCC("A0I1"));
            SetUnitAbilityLevel(hero, FourCC("A0I1"), 1);
            const item = CreateItem(FourCC("I0I1"), GetUnitX(hero), GetUnitY(hero))!;
            items.push(item);
            UnitAddItem(hero, item);
            objects.trackItem(item);
        };
        for (let id = 0; id < bj_MAX_PLAYER_SLOTS; id++) players.push(Player(id)!);
        create(Player(0)!);
        if (GetPlayerSlotState(Player(1)!) === PLAYER_SLOT_STATE_PLAYING) create(Player(1)!);
        owner.add(() => {
            for (const item of items) {
                objects.forgetItem(item);
                RemoveItem(item);
            }
            for (const hero of heroes) {
                objects.forgetUnit(hero);
                RemoveUnit(hero);
            }
        });
        owner.add(installLanguageChat(service, onPlayerChat, players, (text) => logger.info(text)));
        owner.add(
            localEffect(() => {
                logger.info(`BlzGetLocale 原始值：${service.rawLocale}`);
                logger.info(service.t("example.locale", { locale: service.language() }));
                logger.info(service.t("example.ready"));
                logger.info(service.t("example.greeting", { name: service.t("example.traveler") }));
                logger.info(service.t("example.help"));
            }),
        );
        owner.add(
            onPlayerChat
                .pipe(filter((event) => event.message === "-i18n-new"))
                .subscribe((event) => create(event.player)),
        );
        owner.add(
            onPlayerChat.pipe(filter((event) => event.message === "-i18n-level")).subscribe(() => {
                for (const hero of heroes) {
                    SetUnitAbilityLevel(
                        hero,
                        FourCC("A0I1"),
                        GetUnitAbilityLevel(hero, FourCC("A0I1")) === 1 ? 2 : 1,
                    );
                }
            }),
        );
        owner.add(
            onPlayerChat.pipe(filter((event) => event.message === "-i18n-stop")).subscribe(() => {
                owner.unsubscribe();
                logger.info("多語言範例已停止。");
            }),
        );
    } catch (error) {
        owner.unsubscribe();
        logger.error(error);
    }
}
