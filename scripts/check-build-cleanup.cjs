const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

require("ts-node").register({ transpileOnly: true });
const { cleanBuildOutput } = require("./utils.ts");

async function main() {
    const projectDir = process.cwd();
    const tempRoot = fs.realpathSync(os.tmpdir());
    const testDir = fs.mkdtempSync(path.join(tempRoot, "infinite-tower-cleanup-"));
    const outputDir = path.join(testDir, "dist");
    let holder;
    let fileHolder;

    try {
        fs.mkdirSync(outputDir);
        fs.writeFileSync(path.join(testDir, "保留.txt"), "原始資料");
        holder = spawn(
            process.execPath,
            ["-e", "process.stdout.write('就緒'); process.stdin.resume();"],
            {
                cwd: outputDir,
                windowsHide: true,
                stdio: ["pipe", "pipe", "inherit"],
            },
        );
        await once(holder.stdout, "data");
        if (process.platform === "win32") {
            assert.throws(
                () => fs.rmdirSync(outputDir),
                (err) => ["EPERM", "EBUSY", "EACCES"].includes(err.code),
            );
            console.log("已重現其他程序持有輸出根目錄時，直接刪除根目錄會失敗。");
        }

        process.chdir(testDir);
        fs.mkdirSync(path.join(outputDir, "舊資料夾"));
        fs.writeFileSync(path.join(outputDir, "舊資料夾", "產物.lua"), "舊產物");
        cleanBuildOutput();
        assert.deepEqual(fs.readdirSync(outputDir), []);
        assert.equal(fs.readFileSync(path.join(testDir, "保留.txt"), "utf8"), "原始資料");
        console.log("清理通過：保留被使用的輸出根目錄，移除舊產物，保留外部資料。");

        if (process.platform === "win32") {
            const lockedFile = path.join(outputDir, "占用.w3x");
            fs.writeFileSync(lockedFile, "測試地圖");
            fileHolder = spawn(
                "powershell.exe",
                [
                    "-NoProfile",
                    "-Command",
                    "$handle = [System.IO.File]::Open($env:TOWER_CLEANUP_LOCK_FILE, 'Open', 'Read', 'Read'); [Console]::WriteLine('ready'); [Console]::In.ReadLine() | Out-Null; $handle.Dispose()",
                ],
                {
                    env: { ...process.env, TOWER_CLEANUP_LOCK_FILE: lockedFile },
                    windowsHide: true,
                    stdio: ["pipe", "pipe", "inherit"],
                },
            );
            await once(fileHolder.stdout, "data");
            assert.throws(cleanBuildOutput, /無法清除建置內容.*占用\.w3x.*請先關閉魔獸爭霸Ⅲ/);
            assert.equal(fs.readFileSync(lockedFile, "utf8"), "測試地圖");
            const fileExit = once(fileHolder, "exit");
            fileHolder.stdin.end("\n");
            await fileExit;
            fileHolder = null;
            cleanBuildOutput();
            assert.deepEqual(fs.readdirSync(outputDir), []);
            console.log("占用處理通過：顯示操作提示，並在檔案解除占用後完成清理。");
        }
    } finally {
        if (fileHolder) {
            const fileExit = once(fileHolder, "exit");
            fileHolder.stdin.end("\n");
            await fileExit;
        }
        if (holder) {
            const holderExit = once(holder, "exit");
            holder.stdin.end();
            await holderExit;
        }
        process.chdir(projectDir);
        const relative = path.relative(tempRoot, testDir);
        assert(relative.startsWith("infinite-tower-cleanup-") && !relative.includes(path.sep));
        fs.rmSync(testDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error(`清理測試失敗：${err.message}`);
    process.exitCode = 1;
});
