import { FileIoNatives } from "../../src/shared/wc3-def/file-io-natives";

/** 模擬預載檔的技能資料通道，不模擬遊戲的磁碟權限或快取。 */
export function fakeFileIo() {
    const files = new Map<string, string>();
    const outputs = new Map<string, string[]>();
    const lines: string[] = [];
    let tooltip = "原始提示";
    let prepares = 0;
    let writes = 0;
    let failRead = false;
    let failWrite = false;
    const natives: FileIoNatives = {
        prepare: () => {
            prepares++;
        },
        getTooltip: () => tooltip,
        setTooltip: (value) => {
            tooltip = value;
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
            let data = "";
            for (const line of lines) {
                const start = line.indexOf('+"');
                const end = line.indexOf('",0)', start + 2);
                if (start >= 0 && end > start) data += line.slice(start + 2, end);
                else {
                    const begin = line.indexOf(',"');
                    const finish = line.indexOf('",0)', begin + 2);
                    if (begin >= 0 && finish > begin) data = line.slice(begin + 2, finish);
                }
            }
            files.set(path, data);
            outputs.set(path, [...lines]);
            writes++;
        },
        load(path) {
            if (failRead) throw new Error("測試讀取錯誤。");
            const value = files.get(path);
            if (value !== undefined) tooltip = value;
        },
    };
    return {
        natives,
        files,
        outputs,
        lines,
        getTooltip: () => tooltip,
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
