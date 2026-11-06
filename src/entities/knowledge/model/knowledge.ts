import { safeInteger } from "@shared/lib/type-check";

export const KNOWLEDGE_EXP_UNIT = 100; // 1 經驗＝100 單位；每單位顯示為 0.01 經驗
// 小數位數，對應 KNOWLEDGE_EXP_UNIT = 100；不用 Math.log10，避免浮點數誤差
const KNOWLEDGE_EXP_DECIMALS = 2;
export const KNOWLEDGE_EXP_MAX = 4000 * KNOWLEDGE_EXP_UNIT;
export const KNOWLEDGE_MAX_LEVEL = 8; // 等級最高為 8

// 知識節點類型
export const KnowledgeNodeType = {
    Core: "core", // 核心
    Form: "form", // 型態
    Effect: "effect", // 效果
    Modifier: "modifier", // 修飾
    Trigger: "trigger", // 觸發
    Bridge: "bridge", // 橋接
} as const;

export type KnowledgeNodeType = (typeof KnowledgeNodeType)[keyof typeof KnowledgeNodeType];

// 知識七大法則
export const KnowledgeLaw = {
    Form: "form", // 形體法則
    Flow: "flow", // 流動法則
    Energy: "energy", // 能量法則
    Motion: "motion", // 動力法則
    Space: "space", // 空間法則
    Perception: "perception", // 感知法則
    Mind: "mind", // 心智法則
} as const;
export type KnowledgeLaw = (typeof KnowledgeLaw)[keyof typeof KnowledgeLaw];

// 知識深度，參考 docs/dnd/規則/知識體系.md
export const KnowledgeDepth = {
    Basic: "basic", // 基礎
    Professional: "professional", // 專業
    Advanced: "advanced", // 高等
    Unified: "unified", // 統合
} as const;
export type KnowledgeDepth = (typeof KnowledgeDepth)[keyof typeof KnowledgeDepth];

export interface KnowledgeDefinition {
    readonly id: number; // 存檔位置
    readonly name: string; // 名稱。與 Hero.knowledge 相同
    readonly nodeType: KnowledgeNodeType; // 節點類型
    readonly law: KnowledgeLaw; // 所屬法則
    readonly depth: KnowledgeDepth; // 深度
    readonly description: string; // 說明
}

// 定義知識的進度
export interface KnowledgeProgress {
    readonly level: number; // 等級
    readonly currentEXP: number; // 目前累積經驗
    readonly requiredEXP: number; // 所需經驗
}

const safeExp = (units: number) => Math.min(safeInteger(units), KNOWLEDGE_EXP_MAX);
/**
 * @title 計算該經驗能達到多少等級
 * @param {number} exp 累積值
 */
export function knowledgeLevel(exp: number): number {
    let units = safeExp(exp);
    let i = 0;
    for (; i < KNOWLEDGE_MAX_LEVEL; i++) {
        if (knowledgeLevelThreshold(i + 1) > units) break;
    }
    return i;
}

// 計算達到該等級需要的經驗；0 級為 0
export function knowledgeLevelThreshold(level: number): number {
    const safeLevel = safeInteger(level);
    if (safeLevel > KNOWLEDGE_MAX_LEVEL)
        throw new Error(`知識等級必須小於等於 ${KNOWLEDGE_MAX_LEVEL}`);
    return safeLevel * (safeLevel + 1) * 50 * KNOWLEDGE_EXP_UNIT;
}

// 根據經驗輸出知識進度
export function knowledgeProgress(exp: number): KnowledgeProgress {
    exp = safeExp(exp);
    const level = knowledgeLevel(exp);
    const baseEXP = knowledgeLevelThreshold(level);
    return {
        level: level,
        currentEXP: exp - baseEXP,
        requiredEXP:
            level === KNOWLEDGE_MAX_LEVEL ? 0 : knowledgeLevelThreshold(level + 1) - baseEXP,
    };
}

/**
 * 正規化經驗值的表示方法
 * 例如 3500 →「35.00」
 * @param {number} exp
 */
export function formatKnowledgeExp(exp: number): string {
    let expStr = String(safeInteger(exp));
    // 如果 exp < 100，就補 0
    if (expStr.length <= KNOWLEDGE_EXP_DECIMALS)
        expStr = expStr.padStart(KNOWLEDGE_EXP_DECIMALS + 1, "0");
    return `${expStr.slice(0, -1 * KNOWLEDGE_EXP_DECIMALS)}.${expStr.slice(expStr.length - KNOWLEDGE_EXP_DECIMALS)}`;
}
