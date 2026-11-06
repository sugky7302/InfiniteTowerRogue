import { formatKnowledgeExp, knowledgeLevel, knowledgeProgress } from "@entities/knowledge";

function equal(actual: number | string, expected: number | string): void {
    if (actual !== expected || String(actual) !== String(expected))
        throw new Error(`實際值「${actual}」，預期值「${expected}」。`);
}

function rejects(run: (this: void) => void): void {
    let rejected = false;
    try {
        run();
    } catch {
        rejected = true;
    }
    if (!rejected) throw new Error("無效浮點數經驗必須丟出錯誤。");
}

// 使用除法產生 Lua float 子型別，避免整數字面值改變測試輸入。
export const KNOWLEDGE_LUA_CASES: { name: string; run(this: void): void }[] = [
    {
        name: "浮點數零單位顯示為「0.00」",
        run() {
            equal(formatKnowledgeExp(0 / 2), "0.00");
        },
    },
    {
        name: "浮點數五單位顯示為「0.05」",
        run() {
            equal(formatKnowledgeExp(10 / 2), "0.05");
        },
    },
    {
        name: "浮點數五十單位顯示為「0.50」",
        run() {
            equal(formatKnowledgeExp(100 / 2), "0.50");
        },
    },
    {
        name: "浮點數三千五百單位顯示為「35.00」",
        run() {
            equal(formatKnowledgeExp(7000 / 2), "35.00");
        },
    },
    {
        name: "浮點數四十萬單位顯示為「4000.00」",
        run() {
            equal(formatKnowledgeExp(800000 / 2), "4000.00");
        },
    },
    {
        name: "浮點數四十萬零一單位照實顯示為「4000.01」",
        run() {
            equal(formatKnowledgeExp(800002 / 2), "4000.01");
        },
    },
    {
        name: "浮點數三千五百單位的進度為零級且累積三千五百單位",
        run() {
            const actual = knowledgeProgress(7000 / 2);
            equal(actual.level, 0);
            equal(actual.currentEXP, 3500);
            equal(actual.requiredEXP, 10000);
        },
    },
    {
        name: "浮點數三萬單位的進度為二級且本級累積為零",
        run() {
            const actual = knowledgeProgress(60000 / 2);
            equal(actual.level, 2);
            equal(actual.currentEXP, 0);
            equal(actual.requiredEXP, 30000);
        },
    },
    {
        name: "浮點數四十萬與四十萬零一單位的進度皆為八級且所需為零",
        run() {
            for (const units of [800000 / 2, 800002 / 2]) {
                const actual = knowledgeProgress(units);
                equal(actual.level, 8);
                equal(actual.currentEXP, 40000);
                equal(actual.requiredEXP, 0);
            }
        },
    },
    {
        name: "浮點數三千五百單位為零級",
        run() {
            equal(knowledgeLevel(7000 / 2), 0);
        },
    },
    {
        name: "浮點數三萬單位為二級",
        run() {
            equal(knowledgeLevel(60000 / 2), 2);
        },
    },
    {
        name: "浮點數最高等級門檻前後與超過上限的等級正確",
        run() {
            equal(knowledgeLevel(719998 / 2), 7);
            equal(knowledgeLevel(720000 / 2), 8);
            equal(knowledgeLevel(800000 / 2), 8);
            equal(knowledgeLevel(800002 / 2), 8);
        },
    },
    {
        name: "經驗格式化拒絕非整數浮點數",
        run() {
            rejects(() => {
                formatKnowledgeExp(7 / 2);
            });
        },
    },
    {
        name: "進度計算拒絕非整數浮點數",
        run() {
            rejects(() => {
                knowledgeProgress(7 / 2);
            });
        },
    },
    {
        name: "等級計算拒絕非整數浮點數",
        run() {
            rejects(() => {
                knowledgeLevel(7 / 2);
            });
        },
    },
    {
        name: "負數浮點數經驗一律丟出錯誤",
        run() {
            rejects(() => {
                formatKnowledgeExp(-2 / 2);
            });
            rejects(() => {
                knowledgeProgress(-2 / 2);
            });
            rejects(() => {
                knowledgeLevel(-2 / 2);
            });
        },
    },
];
