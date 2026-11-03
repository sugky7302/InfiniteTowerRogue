import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createLocalFileIo, FileWriteStatus } from "../../src/shared/file-io";
import { fakeFileIo } from "./fake-file-io";

test("可閱讀檔案的每條指令完整寫入同一註解行", () => {
    const fake = fakeFileIo();
    const files = createLocalFileIo(fake.natives);
    const lines = ["-load 1/2 " + "A".repeat(80), "-load 2/2 " + "B".repeat(80)];
    assert.equal(files.writeReadable("commands.pld", lines).status, FileWriteStatus.Issued);
    const output = fake.outputs.get("commands.pld")!;
    assert.deepEqual(
        output,
        lines.map((line) => '\")\n// ' + line + "\n//"),
    );
    assert(output.every((line) => Buffer.byteLength(line) < 200));
    assert.equal(fake.lines.length, 0);
});
test("可閱讀檔案拒絕注入字元、換行、空行與超長資料", () => {
    const fake = fakeFileIo();
    const files = createLocalFileIo(fake.natives);
    for (const lines of [
        [],
        [""],
        ['"'],
        ["\\"],
        ["\n"],
        ["中文"],
        ["A".repeat(127)],
        Array(40).fill("A".repeat(126)),
    ]) {
        assert.equal(
            files.writeReadable("commands.pld", lines).status,
            FileWriteStatus.InvalidData,
        );
    }
    assert.equal(fake.writes(), 0);
});
test("可閱讀檔案沿用路徑檢查與寫入失敗清理", () => {
    const fake = fakeFileIo();
    const files = createLocalFileIo(fake.natives);
    assert.equal(
        files.writeReadable("..\\bad.pld", ["-load ABC"]).status,
        FileWriteStatus.InvalidPath,
    );
    fake.failWrite(true);
    assert.equal(files.writeReadable("commands.pld", ["-load ABC"]).status, FileWriteStatus.Failed);
    assert.equal(fake.lines.length, 0);
    assert.equal(fake.writes(), 0);
});
