export type Locale = "zh-TW" | "zh-CN" | "en-US";

/** 接受常見用戶端格式。未知語言使用基準語言。 */
export function localeFromClient(raw: string): Locale {
    const code = raw.trim().toLowerCase().split("-").join("").split("_").join("");
    if (code === "zhcn") return "zh-CN";
    if (code === "enus") return "en-US";
    return "zh-TW";
}

/** 聊天命令只接受規格中的三種明確代碼。 */
export function isLocale(code: string): code is Locale {
    return code === "zh-TW" || code === "zh-CN" || code === "en-US";
}
