const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { decodeDirectory, decodePld } = require("./decode-bench.cjs");

const root = path.resolve(__dirname, "..");

function options(args, env = process.env) {
    // pnpm 會把 `--` 原樣傳給腳本（npm 不會），所以略過開頭的 `--`。
    const [command, label] = args[0] === "--" ? args.slice(1) : args;
    if (
        ![
            "-bench",
            "-bench-stress rx",
            "-bench-stress native",
            "-bench-soak rx",
            "-bench-soak native",
        ].includes(command)
    )
        throw new Error('指令不正確。範例：npm run bench:auto -- "-bench" p3');
    if (!label || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(label))
        throw new Error("標籤只能使用英文字母、數字、底線與連字號，最多 64 字元。");
    const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    const directory = path.resolve(
        env.BENCH_DATA_DIR ||
            path.join(
                env.USERPROFILE || os.homedir(),
                "Documents",
                "Warcraft III",
                "CustomMapData",
                "InfiniteTowerRogue",
            ),
    );
    const output = path.join(root, ".cache", "bench", label);
    const timeout = Number(env.BENCH_TIMEOUT_SECONDS || 1200);
    if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("等待秒數必須大於零。");
    return { command, output, directory, timeout, config };
}

function launch(executable, args, env) {
    // 不得隱藏視窗：WC3 視窗隱藏或在背景時，開啟地圖後不會進入遊戲（2026-11-03 實測）。
    const child = spawn(executable, args, { cwd: root, env, stdio: "inherit", windowsHide: false });
    const state = { child, exited: false, error: undefined };
    state.done = new Promise((resolve) => {
        child.once("error", (error) => {
            state.error = error;
            state.exited = true;
            resolve();
        });
        child.once("exit", (code) => {
            state.code = code;
            state.exited = true;
            resolve();
        });
    });
    return state;
}

async function stop(state) {
    if (!state || state.exited) return;
    state.child.kill();
    await Promise.race([state.done, delay(3000)]);
    if (!state.exited) {
        state.child.kill("SIGKILL");
        await state.done;
    }
}

async function run(settings, runtime = { launch, stop, delay }) {
    if (fs.existsSync(settings.output)) throw new Error("標籤資料夾已存在。請使用新的標籤。");
    const { config } = settings;
    if (process.platform !== "win32" && !config.winePath)
        throw new Error("非 Windows 平台須在 config.json 設定 winePath 與 gameExecutable。");
    // 直接執行 Node 建置入口，避免依賴平台專屬的 npm.cmd。
    const build = runtime.launch(
        process.execPath,
        [require.resolve("ts-node/dist/bin.js"), "--transpile-only", "scripts/build.ts"],
        { ...process.env, BENCH_AUTO: settings.command },
    );
    await build.done;
    if (build.error || build.code !== 0)
        throw new Error(`自動模式建置失敗：${build.error?.message || build.code}`);
    fs.mkdirSync(settings.output, { recursive: true });
    fs.mkdirSync(settings.directory, { recursive: true });
    // 只移除結果資料夾內符合基準檔名的檔案。
    for (const file of fs.readdirSync(settings.directory)) {
        if (
            /^bench-[a-z0-9-]+\.pld$/.test(file) &&
            fs.lstatSync(path.join(settings.directory, file)).isFile()
        )
            fs.unlinkSync(path.join(settings.directory, file));
    }
    const map = path.resolve(root, config.outputFolder, config.mapFolder);
    const mapArgument = config.winePath ? `Z:${map.replaceAll("/", "\\")}` : map;
    const args = ["-loadfile", mapArgument, "-launch", "-windowmode", "windowed"];
    if (config.winePath) args.unshift(config.gameExecutable);
    const env = { ...process.env };
    if (config.winePrefix) env.WINEPREFIX = config.winePrefix;
    let game;
    let interrupted = false;
    const interrupt = () => {
        interrupted = true;
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    let failure;
    try {
        game = runtime.launch(config.winePath || config.gameExecutable, args, env);
        // WC3 在背景時會停在開啟地圖之後，不會進入遊戲（2026-11-03 實測）。
        console.log("遊戲已啟動。請點擊遊戲視窗，讓它保持在前景，直到基準完成。");
        const start = Date.now();
        const marker = path.join(settings.directory, "bench-auto-done.pld");
        while (true) {
            if (interrupted) throw new Error("自動量測已中止。");
            if (fs.existsSync(marker)) {
                // 檔案可能仍在寫入。只有完整框架才視為完成。
                try {
                    if (decodePld(marker) === "done") break;
                } catch {}
            }
            if (game.exited) throw new Error(`遊戲提前結束：${game.error?.message || game.code}`);
            if (Date.now() - start >= settings.timeout * 1000)
                throw new Error("等待基準結果逾時。");
            await runtime.delay(1000);
        }
        await runtime.delay(1000);
    } catch (error) {
        failure = error;
    } finally {
        await runtime.stop(game);
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", interrupt);
        for (const file of fs.readdirSync(settings.directory)) {
            if (
                /^bench-[a-z0-9-]+\.pld$/.test(file) &&
                fs.lstatSync(path.join(settings.directory, file)).isFile()
            )
                fs.copyFileSync(
                    path.join(settings.directory, file),
                    path.join(settings.output, file),
                );
        }
    }
    let decoded = [];
    try {
        decoded = decodeDirectory(settings.output);
    } catch (error) {
        failure ||= error;
    }
    const prefix =
        settings.command === "-bench"
            ? "bench-p1"
            : settings.command.replace("-bench-", "bench-").replace(" ", "-");
    const summary = decoded.find((result) => result.prefix === prefix);
    if (!summary?.lines.some((line) => /(?:^|,)completed=true(?:,|$)/.test(line)))
        failure ||= new Error("結果未標記為完整完成。請檢查保存的結果。");
    fs.writeFileSync(
        path.join(settings.output, "run.json"),
        JSON.stringify(
            {
                command: settings.command,
                date: new Date().toISOString(),
                platform: process.platform,
                cpu: os.cpus()[0]?.model,
                error: failure?.message || null,
            },
            null,
            4,
        ) + "\n",
    );
    process.stdout.write(`結果已保存：${settings.output}\n`);
    if (failure) throw failure;
}

module.exports = { options, run };

if (require.main === module) {
    Promise.resolve()
        .then(() => run(options(process.argv.slice(2))))
        .catch((error) => {
            process.stderr.write(`${error.message}\n`);
            process.exitCode = 1;
        });
}
