const fs = require("node:fs");
const path = require("node:path");

require("ts-node").register({
    project: path.resolve(__dirname, "../tsconfig.test.json"),
    transpileOnly: true,
});
const { decodeFileData } = require("../src/shared/lib/file-io/codec.ts");
const { unescapeFileData, fileAbility } = require("../src/shared/lib/file-io/preload.ts");
const { parseRecords } = require("../src/shared/lib/rxwc3/benchmark/results.ts");

function decodePld(filename) {
    const text = fs.readFileSync(filename, "utf8");
    let userCode = false;
    let accumulating = false;
    let complete = false;
    let escaped = "";
    for (const physical of text.split("\n")) {
        const line = physical.trim();
        if (line === "//! beginusercode") userCode = true;
        else if (line === "//!endusercode") userCode = false;
        else if (userCode && line === "local o=''") escaped = "";
        else if (userCode && line === "Preload=function(s)o=o..s end") accumulating = true;
        else if (userCode && line === `BlzSetAbilityIcon(${fileAbility},o)` && accumulating) {
            complete = true;
            break;
        } else if (!userCode && accumulating) {
            const head = 'call Preload( "';
            const tail = '" )';
            if (line.indexOf(head) === 0 && line.slice(-tail.length) === tail)
                escaped += line.slice(head.length, line.length - tail.length);
        }
    }
    const frame = complete ? unescapeFileData(escaped) : "";
    const data = decodeFileData(frame);
    if (data === undefined) throw new Error(`資料長度或檢查碼錯誤：${filename}`);
    return data;
}

function decodeBenchmark(directory, prefix) {
    if (!/^bench-[a-z0-9-]+$/.test(prefix)) throw new Error("結果檔前綴不正確。");
    const first = decodePld(path.join(directory, `${prefix}.pld`));
    if (prefix === "bench-auto-done") {
        if (first !== "done") throw new Error("自動完成標記不正確。");
        return [first];
    }
    const records = parseRecords(first);
    const header = records[0];
    const pages = Number(header?.pages);
    if (
        header?.schema !== "1" ||
        header.page !== "1" ||
        !Number.isInteger(pages) ||
        pages < 1 ||
        pages > 10000
    )
        throw new Error(`分頁標頭不正確：${prefix}`);
    const lines = first.split(";").filter(Boolean);
    for (let page = 2; page <= pages; page++) {
        const data = decodePld(path.join(directory, `${prefix}-${page}.pld`));
        const next = parseRecords(data)[0];
        if (next?.schema !== "1" || next.page !== `${page}` || next.pages !== `${pages}`)
            throw new Error(`分頁順序不正確：${prefix}-${page}`);
        lines.push(...data.split(";").filter(Boolean));
    }
    return lines;
}

function decodeDirectory(directory) {
    const prefixes = fs
        .readdirSync(directory)
        .filter((name) => /^bench-.*\.pld$/.test(name) && !/-\d+\.pld$/.test(name))
        .map((name) => name.slice(0, -4))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    if (!prefixes.length) throw new Error("沒有基準結果檔。");
    return prefixes.map((prefix) => {
        const lines = decodeBenchmark(directory, prefix);
        fs.writeFileSync(path.join(directory, `${prefix}.txt`), lines.join("\n") + "\n");
        return { prefix, lines };
    });
}

module.exports = { decodePld, decodeBenchmark, decodeDirectory };

if (require.main === module) {
    try {
        // pnpm 會把 `--` 原樣傳給腳本（npm 不會），所以略過開頭的 `--`。
        const args = process.argv.slice(2);
        const [directory, prefix] = args[0] === "--" ? args.slice(1) : args;
        if (!directory) throw new Error("用法：node scripts/decode-bench.cjs <資料夾> [前綴]");
        if (prefix) process.stdout.write(decodeBenchmark(directory, prefix).join("\n") + "\n");
        else {
            const results = decodeDirectory(directory);
            for (const result of results) process.stdout.write(`已解碼：${result.prefix}.txt\n`);
        }
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}
