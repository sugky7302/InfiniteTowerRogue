import { FileNatives } from "./file-natives";

const globals = globalThis as unknown as Record<string, unknown>;

/** 使用既有技能圖示，不建立單位或其他資源。 */
export const wc3FileNatives: FileNatives = {
    getIcon: (ability) => BlzGetAbilityIcon(ability),
    setIcon: (text, ability) => BlzSetAbilityIcon(ability, text),
    clear: () => PreloadGenClear(),
    start: () => PreloadGenStart(),
    emit: (line) => Preload(line),
    finish: (path) => PreloadGenEnd(path),
    load: (path) => {
        // 檔案內的程式會改寫全域 Preload 與 PreloadEnd。讀取後必須還原，否則之後的寫檔會失效。
        const preload = globals.Preload;
        const preloadEnd = globals.PreloadEnd;
        try {
            Preloader(path);
        } finally {
            globals.Preload = preload;
            globals.PreloadEnd = preloadEnd;
        }
    },
};
