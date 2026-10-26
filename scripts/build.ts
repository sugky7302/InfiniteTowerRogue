import * as fs from "fs-extra";
import * as path from "path";
import War3Map from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/map";
import War3MapW3i from "mdx-m3-viewer-th/dist/cjs/parsers/w3x/w3i/file";
import BinaryStream from "mdx-m3-viewer-th/dist/cjs/common/binarystream";
import {
    compileMap,
    getFilesInDirectory,
    loadJsonFile,
    logger,
    toArrayBuffer,
    IProjectConfig,
} from "./utils";

function main() {
    const config: IProjectConfig = loadJsonFile("config.json");
    const minify = process.argv[2] === "-minify" || config.minifyScript;

    if (minify !== config.minifyScript) {
        logger.warn(`已使用命令列參數「-minify」啟用腳本縮減。`);
        config.minifyScript = minify;
    }

    buildMap(config);
}

/**
 * 編譯並封裝地圖，回傳封裝檔的絕對路徑。
 */
export function buildMap(config: IProjectConfig): string {
    if (!compileMap(config)) {
        throw new Error("地圖編譯失敗。");
    }

    logger.info("正在建立地圖封裝檔……");
    fs.ensureDirSync(config.outputFolder);
    const output = path.resolve(config.outputFolder, config.mapFolder);
    createMapFromDir(output, path.resolve("dist", config.mapFolder));
    return output;
}

/**
 * 將資料夾封裝成地圖檔案。
 * @param output 輸出檔案路徑。
 * @param dir 地圖資料夾路徑。
 */
export function createMapFromDir(output: string, dir: string) {
    const map = new War3Map();
    readOnlyW3iHeader(map);
    const files = getFilesInDirectory(dir);

    map.archive.resizeHashtable(files.length);

    for (const fileName of files) {
        const contents = toArrayBuffer(fs.readFileSync(fileName));
        const archivePath = path.relative(dir, fileName);
        const imported = map.import(archivePath, contents);

        if (!imported) {
            throw new Error("無法加入地圖檔案：" + archivePath);
        }
    }

    const result = map.save();

    if (!result) {
        throw new Error("無法儲存地圖封裝檔。");
    }

    fs.writeFileSync(output, new Uint8Array(result));

    logger.info(`地圖封裝完成：${output}`);
}

/**
 * 目前的解析器不支援完整的第 39 版地圖資訊。
 * 封裝時只讀取標頭中的建置版本，保留原始地圖資訊內容。
 */
function readOnlyW3iHeader(map: War3Map) {
    map.getMapInformation = () => {
        const file = map.archive.get("war3map.w3i");
        if (!file) {
            throw new Error("地圖缺少 war3map.w3i。");
        }

        const info = new War3MapW3i();
        const stream = new BinaryStream(file.bytes());
        info.version = stream.readInt32();
        info.saves = stream.readInt32();
        info.editorVersion = stream.readInt32();
        if (info.version > 27) {
            stream.readUint32Array(info.buildVersion);
        }
        return info;
    };
}

if (require.main === module) {
    try {
        main();
    } catch (err: any) {
        logger.error(`建置失敗：${err.message}`);
        process.exitCode = 1;
    }
}
