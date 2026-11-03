const fs = require("node:fs");
const path = require("node:path");

/** 只更新建置輸出的遊戲常數，保留其他區段與設定。 */
function writeSkillMisc(directory) {
    const filename = path.join(directory, "war3mapMisc.txt");
    const original = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const lines = original.split(/\r?\n/);
    let inMisc = false;
    let foundSection = false;
    let inserted = false;
    const output = [];
    for (const line of lines) {
        if (/^\s*\[.*\]/.test(line)) {
            if (inMisc && !inserted) {
                output.push("MinUnitSpeed=0.0");
                inserted = true;
            }
            inMisc = /^\s*\[Misc\]\s*$/i.test(line);
            foundSection ||= inMisc;
        }
        if (inMisc && /^\s*MinUnitSpeed\s*=/i.test(line)) continue;
        output.push(line);
    }
    if (!foundSection) output.push("[Misc]");
    if (!inserted) output.push("MinUnitSpeed=0.0");
    fs.writeFileSync(filename, output.join(newline));
}

module.exports = { writeSkillMisc };
