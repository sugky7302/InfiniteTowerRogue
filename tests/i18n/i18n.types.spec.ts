import { t } from "../../src/shared/lib/i18n/translation";
import { Messages } from "../../src/shared/lib/i18n/locales/zh-TW";
import { enUS } from "../../src/shared/lib/i18n/locales/en-US";

function typeChecks(): void {
    t("example.ready");
    // @ts-expect-error 不存在的翻譯鍵必須編譯失敗。
    t("example.missing");
    const { "example.ready": removed, ...missing } = enUS;
    // @ts-expect-error 英文缺少基準語言的鍵時必須編譯失敗。
    const incomplete: Messages = missing;
    // @ts-expect-error 英文多出基準語言以外的鍵時必須編譯失敗。
    const extra: Messages = { ...enUS, "example.extra": "額外文字" };
    void removed;
    void incomplete;
    void extra;
}
void typeChecks;
