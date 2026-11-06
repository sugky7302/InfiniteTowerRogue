export const zhTW = {
    "example.ready": "多語言範例已啟動。",
    "example.greeting": "你好，{name}。",
    "example.traveler": "旅人",
    "example.locale": "目前語言：{locale}。",
    "example.help":
        "輸入 -lang zh-TW、-lang zh-CN 或 -lang en-US。輸入 -i18n-new 建立新的範例單位與物品。",
    "language.available": "可用語言：zh-TW、zh-CN、en-US。",
};

export type TranslationKey = keyof typeof zhTW;
export type Messages = { [K in TranslationKey]: string };
