import {
    KnowledgeDefinition,
    KnowledgeDepth,
    KnowledgeLaw,
    KnowledgeNodeType,
} from "../model/knowledge";

/**
 * 知識目錄。編號等於存檔位置，已發布的項目不得改變順序或刪除，新知識只加在尾端。
 * 資料取自 `docs/dnd/知識/` 各頁的頁首與第一段。
 */
export const KNOWLEDGE_CATALOG: readonly KnowledgeDefinition[] = [
    {
        id: 0,
        name: "火焰",
        nodeType: KnowledgeNodeType.Core,
        law: KnowledgeLaw.Energy,
        depth: KnowledgeDepth.Basic,
        description: "控制高溫能量、發光與持續氧化反應的魔法核心。",
    },
    {
        id: 1,
        name: "投射",
        nodeType: KnowledgeNodeType.Form,
        law: KnowledgeLaw.Motion,
        depth: KnowledgeDepth.Basic,
        description: "讓力量、物體或效果離開使用者，沿指定方向抵達遠方目標或落點。",
    },
    {
        id: 2,
        name: "區域",
        nodeType: KnowledgeNodeType.Form,
        law: KnowledgeLaw.Space,
        depth: KnowledgeDepth.Basic,
        description: "讓力量不只作用於單一目標，而是覆蓋指定空間。",
    },
    {
        id: 3,
        name: "火之燃燒",
        nodeType: KnowledgeNodeType.Effect,
        law: KnowledgeLaw.Energy,
        depth: KnowledgeDepth.Basic,
        description: "把足夠熱量傳給可燃目標，使其進入持續氧化反應。",
    },
    {
        id: 4,
        name: "冰霜",
        nodeType: KnowledgeNodeType.Core,
        law: KnowledgeLaw.Flow,
        depth: KnowledgeDepth.Basic,
        description: "移除熱量、維持低溫並控制水分凝結或凍結的魔法核心。",
    },
    {
        id: 5,
        name: "移動減速",
        nodeType: KnowledgeNodeType.Effect,
        law: KnowledgeLaw.Motion,
        depth: KnowledgeDepth.Professional,
        description: "在指定持續時間內降低目標移動速度的狀態效果。",
    },
    {
        id: 6,
        name: "魔法解析",
        nodeType: KnowledgeNodeType.Core,
        law: KnowledgeLaw.Perception,
        depth: KnowledgeDepth.Basic,
        description: "辨識持續魔法效果的來源、受益方向、標籤、驅散類型、強度與特殊保護的魔法核心。",
    },
];
