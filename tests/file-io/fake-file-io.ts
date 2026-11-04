import { FileNatives } from "@shared/wc3-def";

/** 模擬預載檔的技能資料通道，不模擬遊戲的磁碟權限或快取。 */
export function fakeFileIo() {
    /** 檔案內容以接回後的框架保存。讀取時再依每段 96 字元放入各等級。 */
    const files = new Map<string, string>();
    const outputs = new Map<string, string[]>();
    const lines: string[] = [];
    const tooltips: string[] = ["原始提示"];
    let prepares = 0;
    let writes = 0;
    let failRead = false;
    let failWrite = false;
    const natives: FileNatives = {
        prepare: () => {
            prepares++;
        },
        getTooltip: (level) => tooltips[level] ?? "",
        setTooltip: (value, level) => {
            tooltips[level] = value;
        },
        clear: () => {
            lines.length = 0;
        },
        start: () => {},
        emit: (line) => {
            lines.push(line);
        },
        finish(path) {
            if (failWrite) throw new Error("測試寫入錯誤。");
            // 模擬 Preloader：每行只設定指定等級，不支援串接。
            const parts: string[] = [];
            for (const line of lines) {
                // Lua 轉譯不支援正規表示式，所以逐段尋找。
                const head = "BlzSetAbilityTooltip('A0IO',\"";
                const start = line.indexOf(head);
                if (start < 0) continue;
                const textEnd = line.indexOf('",', start + head.length);
                const levelEnd = line.indexOf(")", textEnd + 2);
                if (textEnd < 0 || levelEnd < 0) continue;
                parts[Number(line.slice(textEnd + 2, levelEnd))] = line.slice(
                    start + head.length,
                    textEnd,
                );
            }
            files.set(path, parts.join(""));
            outputs.set(path, [...lines]);
            writes++;
        },
        load(path) {
            if (failRead) throw new Error("測試讀取錯誤。");
            const value = files.get(path);
            if (value === undefined) return;
            for (let index = 0; index * 96 < value.length; index++)
                tooltips[index] = value.slice(index * 96, index * 96 + 96);
        },
    };
    return {
        natives,
        files,
        outputs,
        lines,
        getTooltip: () => tooltips[0],
        prepares: () => prepares,
        writes: () => writes,
        failRead: (value: boolean) => {
            failRead = value;
        },
        failWrite: (value: boolean) => {
            failWrite = value;
        },
    };
}
