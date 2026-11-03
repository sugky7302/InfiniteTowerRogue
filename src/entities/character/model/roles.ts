// 全部固定角色數值都是設計稿的試玩值（docs/skill-system/PLAN.md）。英雄法防沿用相同精神、體質公式，體質缺值取 0。
export const scholar = {
    level: 1,
    intelligence: 16,
    spirit: 9,
    constitution: 0,
    manaRegen: 2,
    strength: 2,
    precision: 4,
    agility: 4,
    luck: 0,
    challenge: 1,
    armor: 0,
    weapon: { name: "符文杖", hands: 1, base: 4, coefficient: 0.5 },
    attackSeconds: 1.5,
    attackShape: { kind: "native-melee" },
} as const;
// 來源為 docs/combat-system/PLAN.md。全部欄位都是未平衡的試玩值。
export const patrolMachine = {
    level: 1,
    challenge: 1,
    strength: 4,
    precision: 2,
    agility: 0,
    constitution: 4,
    spirit: 2,
    intelligence: 0,
    luck: 0,
    armor: 10,
    weapon: { name: "定向燈衝擊", hands: 2, base: 6, coefficient: 0.75 },
    prepareSeconds: 0.8,
    recoverySeconds: 0.6,
    attackShape: { kind: "line", length: 160, width: 80 },
} as const;
export const testEnemy = {
    challenge: 1,
    spirit: 4,
    constitution: 4,
    agility: 4,
    resistance: 0,
    combustible: true,
} as const;
