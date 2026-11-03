// 全部固定角色數值都是設計稿的試玩值（docs/skill-system/PLAN.md）。英雄法防沿用相同精神、體質公式，體質缺值取 0。
export const scholar = {
    level: 1,
    intelligence: 16,
    spirit: 9,
    constitution: 0,
    manaRegen: 2,
} as const;
export const testEnemy = {
    challenge: 1,
    spirit: 4,
    constitution: 4,
    agility: 4,
    resistance: 0,
    combustible: true,
} as const;
