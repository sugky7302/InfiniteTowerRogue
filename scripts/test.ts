import { execFile } from "child_process";
import { buildMap } from "./build";
import { loadJsonFile, logger, IProjectConfig } from "./utils";

function main() {
  const config: IProjectConfig = loadJsonFile("config.json");
  const filename = buildMap(config);
  const executable = config.winePath || config.gameExecutable;
  const mapPath = config.winePath ? `Z:${filename}` : filename;
  const args = ["-loadfile", mapPath, ...config.launchArgs];
  if (config.winePath) {
    args.unshift(config.gameExecutable);
  }

  const env = config.winePrefix
    ? { ...process.env, WINEPREFIX: config.winePrefix }
    : process.env;

  logger.info(`正在啟動測試地圖：${filename}`);
  logger.info(`遊戲參數：${JSON.stringify(args)}`);
  execFile(executable, args, { env }, (err) => {
    if (err) {
      logger.error(`遊戲啟動或執行失敗：${err.message}`);
      process.exitCode = 1;
    }
  });
}

try {
  main();
} catch (err: any) {
  logger.error(`地圖測試失敗：${err.message}`);
  process.exitCode = 1;
}
