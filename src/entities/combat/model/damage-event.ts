export const DamageKind = {
    Direct: "direct",
    Dot: "dot",
    Reflect: "reflect",
    Thorns: "thorns",
    Crush: "crush",
    Share: "share",
} as const;
export type DamageKind = (typeof DamageKind)[keyof typeof DamageKind];
export const DamageOutput = {
    Melee: "melee",
    Ranged: "ranged",
    Spell: "spell",
} as const;
export type DamageOutput = (typeof DamageOutput)[keyof typeof DamageOutput];
export const DefenseChannel = {
    Physical: "physical",
    Spell: "spell",
    None: "none",
} as const;
export type DefenseChannel = (typeof DefenseChannel)[keyof typeof DefenseChannel];
export const DamageHistory = {
    Base: "base",
    Added: "added",
    Gained: "gained",
    Converted: "converted",
} as const;
export type DamageHistory = (typeof DamageHistory)[keyof typeof DamageHistory];
export const ReductionLayer = {
    Block: "block",
    Defense: "defense",
    Resistance: "resistance",
    Reduction: "reduction",
    Flat: "flat",
    Absorption: "absorption",
    Vulnerability: "vulnerability",
} as const;
export type ReductionLayer = (typeof ReductionLayer)[keyof typeof ReductionLayer];

export interface DamagePart {
    readonly amount: number;
    readonly tags: readonly string[];
    readonly channel: DefenseChannel;
    readonly history: DamageHistory;
    readonly originalTags?: readonly string[];
    readonly base?: number;
    readonly power?: number;
    readonly coefficient?: number;
}

export interface DamageEvent {
    readonly source: unknown;
    readonly target: unknown;
    readonly kind: DamageKind;
    readonly output: DamageOutput;
    readonly canCrit: boolean;
    readonly skill?: string;
    readonly parts: readonly DamagePart[];
    readonly contact?: boolean;
    readonly bleed?: boolean;
    readonly ignoreReduction?: readonly ReductionLayer[];
    readonly healthDamage?: {
        readonly basis: "current" | "maximum" | "missing";
        readonly rate: number;
        /** 呼叫者保存每次施放剩餘額度，並在套用結果後扣除。 */
        readonly remaining: number;
    };
}

export interface DamageMatch {
    readonly tags?: readonly string[];
    readonly channel?: DefenseChannel;
    readonly output?: DamageOutput;
    readonly kind?: DamageKind;
    readonly skill?: string;
}

export const DamageStat = {
    Increase: "increase",
    More: "more",
    CritChance: "critChance",
    CritDamage: "critDamage",
    CritAvoidance: "critAvoidance",
    CritReduction: "critReduction",
    BlockChance: "blockChance",
    BlockValue: "blockValue",
    CrushChance: "crushChance",
    CrushRate: "crushRate",
    CrushResistance: "crushResistance",
    DefenseIncrease: "defenseIncrease",
    DefenseReduction: "defenseReduction",
    DefenseFlatReduction: "defenseFlatReduction",
    Penetration: "penetration",
    FlatPenetration: "flatPenetration",
    Resistance: "resistance",
    ResistanceReduction: "resistanceReduction",
    ElementPenetration: "elementPenetration",
    ResistanceCap: "resistanceCap",
    Reduction: "reduction",
    FlatReduction: "flatReduction",
    Absorption: "absorption",
    FlatAbsorption: "flatAbsorption",
    Vulnerability: "vulnerability",
    Leech: "leech",
    RecoveryReduction: "recoveryReduction",
    Execute: "execute",
} as const;
export type DamageStat = (typeof DamageStat)[keyof typeof DamageStat];

/** 同一來源識別碼對同一部分最多生效一次。比率以 0 至 1 表示。 */
export interface DamageModifier extends DamageMatch {
    readonly id: string;
    readonly stat: DamageStat;
    readonly value: number;
}
export interface DamageGain {
    readonly from: string;
    readonly rate: number;
    readonly tags: readonly string[];
    readonly channel: DefenseChannel;
}
export interface DamageAddition extends DamagePart {
    /** 缺省只接受直接命中。持續週期必須明列 kind。 */
    readonly match?: DamageMatch;
}
export interface DamageConversion extends DamageGain {
    readonly priority?: number;
}
export interface DamageShield extends DamageMatch {
    readonly id: string;
    readonly capacity: number;
}
export interface DamageReaction {
    readonly rate?: number;
    readonly amount?: number;
    readonly tags: readonly string[];
    readonly channel: DefenseChannel;
}
export interface DamageTarget {
    readonly life: number;
    readonly maxLife: number;
    readonly shields?: readonly DamageShield[];
    readonly physicalDefense?: number;
    readonly spellDefense?: number;
    readonly modifiers?: readonly DamageModifier[];
    readonly immuneTags?: readonly string[];
    readonly critImmune?: boolean;
    readonly crushImmune?: boolean;
    readonly executeImmune?: boolean;
    readonly deathImmune?: boolean;
    readonly preventDeath?: {
        readonly life: number;
        readonly mode: "prevent" | "substitute" | "phase";
    };
    readonly castingStability?: number;
    readonly reflects?: readonly DamageReaction[];
    readonly thorns?: readonly DamageReaction[];
}
export interface DamageAttacker {
    readonly modifiers?: readonly DamageModifier[];
    readonly added?: readonly DamageAddition[];
    readonly gains?: readonly DamageGain[];
    readonly conversions?: readonly DamageConversion[];
    readonly recoveryForbidden?: boolean;
}
export interface DamageShare {
    readonly target: unknown;
    readonly rate: number;
    readonly state: DamageTarget;
}
export interface DamageInput {
    readonly event: DamageEvent;
    readonly target: DamageTarget;
    readonly attacker?: DamageAttacker;
    readonly shares?: readonly DamageShare[];
    /** 前三步的外部判定結果。缺省表示呼叫者已驗證。 */
    readonly gates?: {
        readonly valid?: boolean;
        readonly generated?: boolean;
        readonly hit?: boolean;
    };
    readonly rolls?: Partial<Record<"crit" | "block" | "crush", boolean>>;
    readonly roll?: (this: void, kind: "crit" | "block" | "crush", chance: number) => boolean;
    /** Node 使用 Math.fround。正式 Lua 使用執行環境的浮點精度。 */
    readonly round?: (this: void, value: number) => number;
}
export interface DamageRecipient {
    readonly target: unknown;
    readonly state: DamageTarget;
    readonly parts: readonly DamagePart[];
    readonly life: number;
    readonly shields: readonly DamageShield[];
    readonly shieldConsumed: number;
    readonly lifeLoss: number;
    readonly prevented: boolean;
    readonly executed: boolean;
    readonly knockedDown: boolean;
}
export interface DamageState {
    readonly input: DamageInput;
    readonly parts: readonly DamagePart[];
    readonly active: boolean;
    readonly critical: boolean;
    readonly blocked: boolean;
    readonly crushDamage: number;
    readonly crushLifeLoss: number;
    readonly crushShieldConsumed: number;
    readonly targetLife: number;
    readonly shields: readonly DamageShield[];
    readonly defenseBase: readonly number[];
    readonly effectiveDefenses: readonly number[];
    readonly resistances: readonly number[];
    readonly recipients: readonly DamageRecipient[];
    readonly leech: number;
    readonly reactions: readonly DamageEvent[];
    readonly stabilityCheck?: number;
    readonly damageBreak: boolean;
    readonly shieldHit: boolean;
    readonly shieldBroken: boolean;
    readonly killed: boolean;
    readonly healthDamageUsed: number;
}
export interface DamageTrace {
    readonly step: number;
    readonly state: DamageState;
}
export interface DamageResult extends DamageState {
    readonly trace: readonly DamageTrace[];
}
