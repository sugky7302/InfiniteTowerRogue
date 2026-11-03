import { localeFromClient } from "../../src/shared/i18n/locale";
import { createI18n } from "../../src/shared/i18n/translation";
import { createObjectText } from "../../src/shared/i18n/object-text";
import { localComputed, localEffect } from "../../src/shared/rxwc3/signal";
import { fakeNatives, fixtureData } from "./fake-natives";
export { wc3I18nNatives as natives } from "../../src/shared/i18n/natives";
export { t, getI18n } from "../../src/shared/i18n/translation";

function check(value: boolean, message: string): void {
    if (!value) throw new Error(message);
}

/** 此流程同時由 Node 與 Lua 5.3 執行。 */
export function verifyI18n(): number {
    const fake = fakeNatives();
    const service = createI18n(fake.natives);
    check(
        localeFromClient("zH-tW") === "zh-TW" &&
            localeFromClient("EN_us") === "en-US" &&
            localeFromClient("zhCN") === "zh-CN" &&
            localeFromClient("frFR") === "zh-TW",
        "語言對應錯誤。",
    );
    check(service.t("example.greeting", { name: "旅人" }) === "你好，旅人。", "參數替換錯誤。");
    check(
        service.t("example.greeting", { name: "{locale}" }) === "你好，{locale}。",
        "參數被重複解析。",
    );
    const computed = localComputed(() =>
        service.t("example.locale", { locale: service.language() }),
    );
    const values: string[] = [];
    const effect = localEffect(() => {
        values.push(computed());
    });
    const objects = createObjectText(service, fixtureData(), fake.natives);
    const target = {} as unit;
    const item = {} as item;
    objects.trackUnit(target);
    objects.trackItem(item);
    check(fake.calls[0].level === 0 && fake.calls[1].level === 1, "技能等級換算錯誤。");
    service.language.set("en-US");
    check(values.length === 2 && computed() === "Current language: en-US.", "本地計算沒有更新。");
    check(
        fake.calls.some((call) => call.target === target && call.text === "Guard") &&
            fake.calls.some((call) => call.target === item && call.text === "Charm"),
        "物件沒有切換。",
    );
    check(
        fake.calls.some((call) => call.field === "ubertip" && call.text === "技能二說明"),
        "後備文字錯誤。",
    );
    effect.destroy();
    objects.destroy();
    return 7;
}
