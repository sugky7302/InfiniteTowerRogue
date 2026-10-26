import { execSync } from "child_process";
import { writeFileSync } from "fs";
import * as fs from "fs-extra";
import * as path from "path";
import { createLogger, format, transports } from "winston";
const { combine, timestamp, printf } = format;
const luamin = require("luamin");

export interface IProjectConfig {
    mapFolder: string;
    minifyScript: boolean;
    gameExecutable: string;
    outputFolder: string;
    launchArgs: string[];
    winePath?: string;
    winePrefix?: string;
}

/**
 * Load an object from a JSON file.
 * @param fname The JSON file
 */
export function loadJsonFile(fname: string) {
    try {
        return JSON.parse(fs.readFileSync(fname).toString());
    } catch (e: any) {
        logger.error(e.toString());
        return {};
    }
}

/**
 * Convert a Buffer to ArrayBuffer
 * @param b
 */
export function toArrayBuffer(b: Buffer): ArrayBuffer {
    var ab = new ArrayBuffer(b.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < b.length; ++i) {
        view[i] = b[i];
    }
    return ab;
}

/**
 * Convert an ArrayBuffer to Buffer
 * @param ab
 */
export function toBuffer(ab: ArrayBuffer) {
    var buf = Buffer.alloc(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        buf[i] = view[i];
    }
    return buf;
}

/**
 * Recursively retrieve a list of files in a directory.
 * @param dir The path of the directory
 */
export function getFilesInDirectory(dir: string) {
    const files: string[] = [];
    fs.readdirSync(dir).forEach((file) => {
        let fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            const d = getFilesInDirectory(fullPath);
            for (const n of d) {
                files.push(n);
            }
        } else {
            files.push(fullPath);
        }
    });
    return files;
}

function updateTSConfig(mapFolder: string) {
    const tsconfig = loadJsonFile("tsconfig.json");
    const plugin = tsconfig.compilerOptions.plugins[0];

    plugin.mapDir = path.resolve("maps", mapFolder).replace(/\\/g, "/");
    plugin.entryFile = path.resolve(tsconfig.tstl.luaBundleEntry).replace(/\\/g, "/");
    plugin.outputDir = path.resolve("dist", mapFolder).replace(/\\/g, "/");

    writeFileSync("tsconfig.json", JSON.stringify(tsconfig, undefined, 2));
}

/**
 * 保留輸出根目錄，只移除舊建置內容。
 */
export function cleanBuildOutput() {
    const outputDir = path.resolve("dist");
    fs.ensureDirSync(outputDir);
    if (fs.lstatSync(outputDir).isSymbolicLink()) {
        throw new Error(`輸出資料夾不可使用符號連結：${outputDir}`);
    }

    for (const entry of fs.readdirSync(outputDir)) {
        const target = path.join(outputDir, entry);
        try {
            fs.rmSync(target, {
                recursive: true,
                force: true,
                maxRetries: 3,
                retryDelay: 100,
            });
        } catch (err: any) {
            throw new Error(
                `無法清除建置內容「${target}」（${err.code || "未知錯誤"}）。` +
                    "檔案可能被占用或缺少刪除權限。請先關閉魔獸爭霸Ⅲ，以及開啟 dist 內地圖的編輯器，再重試。",
            );
        }
    }
}

/**
 * 清理舊建置內容，編譯並合併地圖腳本。
 */
export function compileMap(config: IProjectConfig) {
    if (!config.mapFolder) {
        logger.error("config.json 缺少 mapFolder 設定。");
        return false;
    }

    logger.info("正在清理舊建置內容，保留 dist 資料夾……");
    cleanBuildOutput();

    logger.info(`正在準備地圖「${config.mapFolder}」……`);
    fs.copySync(`./maps/${config.mapFolder}`, `./dist/${config.mapFolder}`);

    logger.info("正在更新編譯器的地圖路徑……");
    updateTSConfig(config.mapFolder);

    logger.info("正在將 TypeScript 轉換為 Lua……");
    execSync("tstl -p tsconfig.json", { stdio: "inherit" });

    const tsLua = "./dist/tstl_output.lua";
    if (!fs.existsSync(tsLua)) {
        logger.error(`找不到 Lua 編譯產物：${tsLua}`);
        return false;
    }

    // 全部建置期物件修改完成後，產生翻譯範本並把翻譯資料寫入 Lua。
    logger.info("正在產生物件翻譯範本與 Lua 翻譯表……");
    const translations = require("./i18n-objects.cjs").finalizeTranslations(
        process.cwd(),
        config.mapFolder,
        tsLua,
    );
    logger.info("正在產生自動層語言字串檔……");
    require("./i18n-locales.cjs").buildLocales(process.cwd(), config.mapFolder, translations);

    // 將編譯產物合併到地圖腳本。
    const mapLua = `./dist/${config.mapFolder}/war3map.lua`;

    if (!fs.existsSync(mapLua)) {
        logger.error(`找不到地圖腳本：${mapLua}`);
        return false;
    }

    try {
        let contents = fs.readFileSync(mapLua).toString() + fs.readFileSync(tsLua).toString();

        if (config.minifyScript) {
            logger.info("正在縮減地圖腳本……");
            contents = luamin.minify(contents.toString());
        }

        fs.writeFileSync(mapLua, contents);
    } catch (err: any) {
        logger.error(err.toString());
        return false;
    }

    return true;
}

/**
 * Formatter for log messages.
 */
const loggerFormatFunc = printf(({ level, message, timestamp }) => {
    return `[${(timestamp as string).replace("T", " ").split(".")[0]}] ${level}: ${message}`;
});

/**
 * The logger object.
 */
export const logger = createLogger({
    transports: [
        new transports.Console({
            format: combine(format.colorize(), timestamp(), loggerFormatFunc),
        }),
        new transports.File({
            filename: "project.log",
            format: combine(timestamp(), loggerFormatFunc),
        }),
    ],
});
