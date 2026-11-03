import {
    ReductionLayer,
    DefenseChannel,
    DamageStat,
    DamageHistory,
    DamageKind,
    DamageOutput,
    DamageInput,
    DamageState,
    DamageModifier,
    settleDamage,
    createDamageState,
    damageSteps,
    deriveCombatStats,
    generalCheckValue,
    checkValue,
    rollCheck,
    attributeModifier,
    createCombatLife,
    updateCombatLife,
    recoverCombatLife,
    reviveCombatLife,
    selectBleedingWound,
    snapshotDamageOffense,
    meleeReach,
} from "@entities/combat";
import { scholar, patrolMachine } from "@entities/character";
import { flameInput, modifier, part, simpleInput } from "./fixtures";

type Round = (this: void, value: number) => number;
export interface CombatCase {
    readonly name: string;
    readonly run: (this: void, round?: Round) => void;
}
function check(condition: boolean, message = "戰鬥案例結果錯誤。"): void {
    if (!condition) throw new Error(message);
}
function near(actual: number, expected: number): void {
    check(Math.abs(actual - expected) < 0.001, `戰鬥數值 ${actual} 與預期 ${expected} 不符。`);
}
function sum(s: DamageState, tag?: string): number {
    let result = 0;
    for (const item of s.parts)
        if (tag === undefined || item.tags.includes(tag)) result += item.amount;
    return result;
}
function run(input: DamageInput, round?: Round) {
    return settleDamage({ ...input, round });
}
function withoutRolls(input: DamageInput): DamageInput {
    const { rolls, ...rest } = input;
    return rest;
}
function targetMods(modifiers: readonly DamageModifier[], amount = 100): DamageInput {
    const input = simpleInput(amount);
    return { ...input, target: { ...input.target, modifiers } };
}
const flameSteps = [
    [80, 0],
    [80, 0],
    [80, 0],
    [100, 0],
    [100, 20],
    [100, 40],
    [50, 90],
    [50, 90],
    [60, 135],
    [72, 162],
    [126, 283.5],
    [113.6923, 255.8077],
    [113.6923, 255.8077],
    [67.876, 150.4751],
    [61.0884, 112.8563],
    [54.9796, 101.5707],
    [51.4676, 95.0826],
    [51.4676, 71.0661],
    [61.7611, 78.1727],
    [46.3208, 58.6295],
    [46.3208, 58.6295],
    [46.3208, 58.6295],
    [46.3208, 58.6295],
    [46.3208, 58.6295],
    [46.3208, 58.6295],
    [46.3208, 58.6295],
];

export const combatCases: CombatCase[] = [];
for (let index = 0; index < 26; index++) {
    const stepIndex = index;
    combatCases.push({
        name: `烈焰斬第 ${stepIndex + 1} 步與獨立函式`,
        run(round) {
            const input = flameInput(round);
            const result = settleDamage(input);
            const snapshot = result.trace[stepIndex].state;
            near(sum(snapshot, "physical"), flameSteps[stepIndex][0]);
            near(sum(snapshot, "fire"), flameSteps[stepIndex][1]);
            const previous =
                stepIndex === 0 ? createDamageState(input) : result.trace[stepIndex - 1].state;
            const independent = damageSteps[stepIndex](previous);
            near(sum(independent), sum(snapshot));
            near(independent.targetLife, snapshot.targetLife);
            if (stepIndex >= 12) {
                near(snapshot.crushDamage, 80);
                near(snapshot.crushLifeLoss, 30);
                near(snapshot.crushShieldConsumed, 50);
            }
            if (stepIndex >= 13) {
                near(snapshot.effectiveDefenses[0], 67.5);
                near(snapshot.effectiveDefenses[1], 70);
            }
            if (stepIndex >= 20) near(snapshot.recipients[1].shieldConsumed, 20);
            if (stepIndex >= 21) {
                near(snapshot.recipients[0].life, 865.0496);
                near(snapshot.recipients[0].lifeLoss, 104.9504);
                near(snapshot.recipients[1].lifeLoss, 14.9835);
            }
            if (stepIndex >= 24) {
                near(snapshot.leech, 10.495);
                near(snapshot.reactions[0].parts[0].amount, 20.9901);
                near(snapshot.stabilityCheck!, 109.9504);
            }
            check(result.trace.length === 26 && result.trace[stepIndex].step === stepIndex + 1);
        },
    });
}

combatCases.push(
    {
        name: "前三步分別拒絕驗證、標籤與命中失敗",
        run(round) {
            for (const gates of [{ valid: false }, { generated: false }, { hit: false }]) {
                let rolls = 0;
                const input = flameInput();
                const result = run(
                    {
                        ...withoutRolls(input),
                        gates,
                        roll: () => {
                            rolls++;
                            return true;
                        },
                    },
                    round,
                );
                near(result.recipients[0].lifeLoss, 0);
                check(!result.active && rolls === 0 && result.reactions.length === 0);
            }
        },
    },
    {
        name: "免疫只移除最終火焰部分",
        run(round) {
            const input = flameInput();
            const result = run(
                { ...input, target: { ...input.target, immuneTags: ["fire"] } },
                round,
            );
            near(sum(result.trace[7].state), 50);
            check(result.trace[7].state.parts.every((item) => item.tags.includes("physical")));
        },
    },
    {
        name: "全部免疫不擲格擋與壓碎",
        run(round) {
            const input = flameInput();
            let rolls = 0;
            const result = run(
                {
                    ...withoutRolls(input),
                    roll: () => {
                        rolls++;
                        return true;
                    },
                    target: { ...input.target, immuneTags: ["physical", "fire"] },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 0);
            check(rolls === 0 && !result.blocked && result.crushDamage === 0);
        },
    },
    {
        name: "轉換超額按明列優先順序截斷",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    attacker: {
                        conversions: [
                            {
                                from: "physical",
                                rate: 0.8,
                                tags: ["fire"],
                                channel: DefenseChannel.Spell,
                                priority: 1,
                            },
                            {
                                from: "physical",
                                rate: 0.8,
                                tags: ["frost"],
                                channel: DefenseChannel.Spell,
                                priority: 2,
                            },
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[6].state, "fire"), 80);
            near(sum(result.trace[6].state, "frost"), 20);
            near(sum(result.trace[6].state), 100);
        },
    },
    {
        name: "轉換超額無優先順序時等比例正規化",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    attacker: {
                        conversions: [
                            {
                                from: "physical",
                                rate: 0.8,
                                tags: ["fire"],
                                channel: DefenseChannel.Spell,
                            },
                            {
                                from: "physical",
                                rate: 0.8,
                                tags: ["frost"],
                                channel: DefenseChannel.Spell,
                            },
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[6].state, "fire"), 50);
            near(sum(result.trace[6].state, "frost"), 50);
        },
    },
    {
        name: "額外獲得共用原始快照且不重複獲得",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    attacker: {
                        gains: [
                            {
                                from: "physical",
                                rate: 0.5,
                                tags: ["physical"],
                                channel: DefenseChannel.Physical,
                            },
                            {
                                from: "physical",
                                rate: 0.5,
                                tags: ["fire"],
                                channel: DefenseChannel.Spell,
                            },
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[5].state, "physical"), 150);
            near(sum(result.trace[5].state, "fire"), 50);
        },
    },
    {
        name: "轉換歷史可以匹配原始類型且同來源只加一次",
        run(round) {
            const input = simpleInput();
            const increase = modifier(DamageStat.Increase, 0.2, ["physical", "fire"]);
            const result = run(
                {
                    ...input,
                    attacker: {
                        conversions: [
                            {
                                from: "physical",
                                rate: 1,
                                tags: ["fire"],
                                channel: DefenseChannel.Spell,
                            },
                        ],
                        modifiers: [increase, increase],
                    },
                },
                round,
            );
            near(sum(result.trace[8].state), 120);
            check(result.trace[6].state.parts[0].history === DamageHistory.Converted);
        },
    },
    {
        name: "降低傷害最低歸零且乘區依序計算",
        run(round) {
            const input = simpleInput();
            const reduced = run(
                { ...input, attacker: { modifiers: [modifier(DamageStat.Increase, -2)] } },
                round,
            );
            near(sum(reduced.trace[8].state), 0);
            const result = run(
                {
                    ...input,
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.More, 0.2),
                            { ...modifier(DamageStat.More, -0.5), id: "less" },
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[9].state), 60);
        },
    },
    {
        name: "暴擊只擲一次且傳入扣迴避後機率",
        run(round) {
            const input = flameInput();
            let critCalls = 0;
            run(
                {
                    ...withoutRolls(input),
                    roll: (kind, chance) => {
                        if (kind === "crit") {
                            critCalls++;
                            near(chance, 0.2);
                        }
                        return true;
                    },
                },
                round,
            );
            check(critCalls === 1);
        },
    },
    {
        name: "零暴擊率與暴擊免疫不呼叫骰子",
        run(round) {
            const input = flameInput();
            for (const target of [
                { ...input.target, critImmune: true },
                { ...input.target, modifiers: [modifier(DamageStat.CritAvoidance, 0.5)] },
            ]) {
                let count = 0;
                const result = run(
                    {
                        ...input,
                        target,
                        rolls: { block: false, crush: false },
                        roll: (kind) => {
                            if (kind === "crit") count++;
                            return true;
                        },
                    },
                    round,
                );
                check(count === 0 && !result.critical);
            }
        },
    },
    {
        name: "暴擊傷害降低上限與最低普通傷害",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    rolls: { crit: true },
                    attacker: { modifiers: [modifier(DamageStat.CritChance, 0.5)] },
                    target: { ...input.target, modifiers: [modifier(DamageStat.CritReduction, 2)] },
                },
                round,
            );
            near(sum(result.trace[10].state), 125);
            const low = run(
                {
                    ...input,
                    rolls: { crit: true },
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.CritChance, 0.5),
                            modifier(DamageStat.CritDamage, -5),
                        ],
                    },
                },
                round,
            );
            near(sum(low.trace[10].state), 100);
        },
    },
    {
        name: "格擋完全抵消時不再擲壓碎",
        run(round) {
            const input = flameInput();
            let crushRolls = 0;
            const result = run(
                {
                    ...input,
                    rolls: { crit: false, block: true },
                    roll: (kind) => {
                        if (kind === "crush") crushRolls++;
                        return true;
                    },
                    target: {
                        ...input.target,
                        modifiers: [
                            modifier(DamageStat.BlockChance, 0.75),
                            modifier(DamageStat.BlockValue, 1000),
                        ],
                    },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 0);
            check(result.blocked && crushRolls === 0);
        },
    },
    {
        name: "混合格擋及固定減傷只扣一次並保留總額",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        parts: [part(10), part(20, "fire", "spell"), part(30, "frost", "spell")],
                    },
                    target: {
                        ...input.target,
                        modifiers: [
                            modifier(DamageStat.BlockChance, 0.75),
                            modifier(DamageStat.BlockValue, 7),
                            modifier(DamageStat.FlatReduction, 11),
                        ],
                    },
                    rolls: { block: true },
                },
                round,
            );
            near(sum(result.trace[11].state), 53);
            near(sum(result.trace[16].state), 42);
            near(result.recipients[0].lifeLoss, 42);
        },
    },
    {
        name: "壓碎忽略普通減傷且不能擊殺",
        run(round) {
            const input = targetMods([
                modifier(DamageStat.Reduction, 0.8),
                modifier(DamageStat.FlatReduction, 1000),
            ]);
            const result = run(
                {
                    ...input,
                    target: { ...input.target, life: 10, maxLife: 10, physicalDefense: 10000 },
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.CrushChance, 1),
                            modifier(DamageStat.CrushRate, 1),
                            modifier(DamageStat.Leech, 1),
                        ],
                    },
                    rolls: { crush: true },
                },
                round,
            );
            near(result.crushDamage, 10);
            near(result.crushLifeLoss, 9);
            near(result.targetLife, 1);
            near(result.leech, 0);
        },
    },
    {
        name: "壓碎免疫與壓碎抗性上限",
        run(round) {
            const input = flameInput();
            const immune = run({ ...input, target: { ...input.target, crushImmune: true } }, round);
            near(immune.crushDamage, 0);
            const resisted = run(
                {
                    ...input,
                    target: {
                        ...input.target,
                        modifiers: [modifier(DamageStat.CrushResistance, 2)],
                    },
                },
                round,
            );
            near(resisted.crushDamage, 0);
        },
    },
    {
        name: "防禦四層順序、下限與減傷上限",
        run(round) {
            const input = targetMods([
                modifier(DamageStat.DefenseReduction, 0.2),
                modifier(DamageStat.DefenseFlatReduction, 10),
            ]);
            const result = run(
                {
                    ...input,
                    target: { ...input.target, physicalDefense: 150 },
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.Penetration, 0.25),
                            modifier(DamageStat.FlatPenetration, 15),
                        ],
                    },
                },
                round,
            );
            near(result.effectiveDefenses[0], 67.5);
            const high = run(
                { ...simpleInput(), target: { life: 1000, maxLife: 1000, physicalDefense: 10000 } },
                round,
            );
            near(sum(high.trace[13].state), 20);
            const low = run(
                {
                    ...input,
                    attacker: { modifiers: [modifier(DamageStat.FlatPenetration, 10000)] },
                },
                round,
            );
            near(low.effectiveDefenses[0], 0);
        },
    },
    {
        name: "抗性下限負百分之百及普通上限百分之七十五",
        run(round) {
            near(
                run(targetMods([modifier(DamageStat.Resistance, -2)]), round).recipients[0]
                    .lifeLoss,
                200,
            );
            near(
                run(targetMods([modifier(DamageStat.Resistance, 2)]), round).recipients[0].lifeLoss,
                25,
            );
        },
    },
    {
        name: "抗性超額先保留再扣降低與穿透，特殊上限百分之九十",
        run(round) {
            const input = targetMods([
                modifier(DamageStat.Resistance, 1.2),
                modifier(DamageStat.ResistanceReduction, 0.2),
                modifier(DamageStat.ResistanceCap, 0.5),
            ]);
            const result = run(
                {
                    ...input,
                    attacker: { modifiers: [modifier(DamageStat.ElementPenetration, 0.15)] },
                },
                round,
            );
            near(result.resistances[0], 0.85);
            near(result.recipients[0].lifeLoss, 15);
            near(
                run(
                    targetMods([
                        modifier(DamageStat.Resistance, 2),
                        modifier(DamageStat.ResistanceCap, 1),
                    ]),
                    round,
                ).resistances[0],
                0.9,
            );
        },
    },
    {
        name: "百分比聯合減傷上限百分之九十五且固定減傷在後",
        run(round) {
            const input = targetMods([
                modifier(DamageStat.Resistance, 0.75),
                modifier(DamageStat.Reduction, 1),
                modifier(DamageStat.FlatReduction, 3),
            ]);
            const result = run(
                { ...input, target: { ...input.target, physicalDefense: 10000 } },
                round,
            );
            near(sum(result.trace[15].state), 5);
            near(result.recipients[0].lifeLoss, 2);
        },
    },
    {
        name: "元素吸收上限、固定池與易傷上限",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        parts: [part(40, "fire", "spell"), part(60, "fire", "spell")],
                    },
                    target: {
                        ...input.target,
                        modifiers: [
                            modifier(DamageStat.Absorption, 1, ["fire"]),
                            modifier(DamageStat.FlatAbsorption, 10, ["fire"]),
                            modifier(DamageStat.Vulnerability, 3, ["fire"]),
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[17].state), 50);
            near(sum(result.trace[18].state), 100);
        },
    },
    {
        name: "固定減傷與固定吸收足夠時歸零",
        run(round) {
            near(
                run(targetMods([modifier(DamageStat.FlatReduction, 200)]), round).recipients[0]
                    .lifeLoss,
                0,
            );
            near(
                run(targetMods([modifier(DamageStat.FlatAbsorption, 200)]), round).recipients[0]
                    .lifeLoss,
                0,
            );
        },
    },
    {
        name: "分攤不重複防禦、抗性或易傷但接受護盾",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    shares: [
                        {
                            target: "guardian",
                            rate: 0.5,
                            state: {
                                life: 1000,
                                maxLife: 1000,
                                physicalDefense: 10000,
                                modifiers: [
                                    modifier(DamageStat.Resistance, 0.75),
                                    modifier(DamageStat.Vulnerability, 1),
                                ],
                                shields: [{ id: "shield", capacity: 20 }],
                            },
                        },
                    ],
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 50);
            near(result.recipients[1].lifeLoss, 30);
        },
    },
    {
        name: "多個分攤依順序截斷至百分之百",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    shares: [
                        { target: "one", rate: 0.8, state: input.target },
                        { target: "two", rate: 0.8, state: input.target },
                    ],
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 0);
            near(result.recipients[1].lifeLoss, 80);
            near(result.recipients[2].lifeLoss, 20);
        },
    },
    {
        name: "護盾溢出與部分標籤匹配",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: { ...input.event, parts: [part(60), part(40, "fire", "spell")] },
                    target: {
                        ...input.target,
                        shields: [{ id: "fire", capacity: 50, tags: ["fire"] }],
                    },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 60);
            near(result.shields[0].capacity, 10);
            check(result.shieldHit && !result.shieldBroken);
            const overflow = run(
                { ...input, target: { ...input.target, shields: [{ id: "small", capacity: 30 }] } },
                round,
            );
            near(overflow.recipients[0].lifeLoss, 70);
            check(overflow.shieldHit && overflow.shieldBroken);
        },
    },
    {
        name: "護盾全吸收仍有荊棘且無反射、偷取與穩定檢定",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    attacker: { modifiers: [modifier(DamageStat.Leech, 0.5)] },
                    target: {
                        ...input.target,
                        shields: [{ id: "full", capacity: 200 }],
                        castingStability: 5,
                        reflects: [{ rate: 1, tags: ["fire"], channel: DefenseChannel.Spell }],
                        thorns: [
                            { amount: 7, tags: ["physical"], channel: DefenseChannel.Physical },
                        ],
                    },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 0);
            near(result.leech, 0);
            check(result.stabilityCheck === undefined && !result.damageBreak);
            check(result.reactions.length === 1 && result.reactions[0].kind === DamageKind.Thorns);
            near(result.reactions[0].parts[0].amount, 7);
        },
    },
    {
        name: "生命損失排除溢出與斬殺量",
        run(round) {
            const input = simpleInput(200);
            const result = run(
                {
                    ...input,
                    target: { life: 50, maxLife: 100 },
                    attacker: { modifiers: [modifier(DamageStat.Leech, 0.1)] },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 50);
            near(result.leech, 5);
            check(result.killed);
        },
    },
    {
        name: "斬殺嚴格低於門檻且普通門檻上限百分之十",
        run(round) {
            const input = simpleInput(1);
            const attacker = {
                modifiers: [modifier(DamageStat.Execute, 1), modifier(DamageStat.Leech, 1)],
            };
            const equal = run({ ...input, attacker, target: { life: 11, maxLife: 100 } }, round);
            check(!equal.recipients[0].executed);
            const below = run({ ...input, attacker, target: { life: 10, maxLife: 100 } }, round);
            check(below.recipients[0].executed && below.killed);
            near(below.leech, 1);
            near(below.targetLife, 0);
        },
    },
    {
        name: "斬殺免疫與零生命損失不觸發斬殺",
        run(round) {
            const input = simpleInput(1);
            const attacker = { modifiers: [modifier(DamageStat.Execute, 0.1)] };
            const immune = run(
                { ...input, attacker, target: { life: 10, maxLife: 100, executeImmune: true } },
                round,
            );
            check(!immune.recipients[0].executed);
            const shield = run(
                {
                    ...input,
                    attacker,
                    target: { life: 5, maxLife: 100, shields: [{ id: "full", capacity: 10 }] },
                },
                round,
            );
            check(!shield.recipients[0].executed);
        },
    },
    {
        name: "阻止死亡、替身與階段轉換優先於斬殺",
        run(round) {
            const input = simpleInput(100);
            for (const mode of ["prevent", "substitute", "phase"] as const) {
                const result = run(
                    {
                        ...input,
                        attacker: { modifiers: [modifier(DamageStat.Execute, 0.1)] },
                        target: { life: 50, maxLife: 100, preventDeath: { life: 1, mode } },
                    },
                    round,
                );
                near(result.targetLife, 1);
                near(result.recipients[0].lifeLoss, 49);
                check(
                    result.recipients[0].prevented &&
                        !result.recipients[0].executed &&
                        !result.killed,
                );
            }
        },
    },
    {
        name: "死亡免疫阻止直接擊殺與斬殺",
        run(round) {
            const input = simpleInput(100);
            const result = run(
                {
                    ...input,
                    attacker: { modifiers: [modifier(DamageStat.Execute, 0.1)] },
                    target: { life: 50, maxLife: 100, deathImmune: true },
                },
                round,
            );
            near(result.targetLife, 1);
            check(!result.killed);
        },
    },
    {
        name: "生命恢復降低與禁療影響偷取",
        run(round) {
            const input = simpleInput();
            const attacker = {
                modifiers: [
                    modifier(DamageStat.Leech, 0.1),
                    modifier(DamageStat.RecoveryReduction, 2),
                ],
            };
            near(run({ ...input, attacker }, round).leech, 2);
            near(
                run({ ...input, attacker: { ...attacker, recoveryForbidden: true } }, round).leech,
                0,
            );
        },
    },
    {
        name: "反射與荊棘不連鎖且正常經過防禦",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    target: {
                        ...input.target,
                        reflects: [{ rate: 0.2, tags: ["fire"], channel: DefenseChannel.Spell }],
                        thorns: [
                            { amount: 10, tags: ["physical"], channel: DefenseChannel.Physical },
                        ],
                    },
                },
                round,
            );
            check(result.reactions.length === 2);
            for (const event of result.reactions) {
                const reflected = run(
                    {
                        ...flameInput(),
                        attacker: {
                            modifiers: [
                                modifier(DamageStat.CritChance, 0.5),
                                modifier(DamageStat.Leech, 1),
                                modifier(DamageStat.CrushChance, 1),
                            ],
                        },
                        event: { ...event, canCrit: true },
                        shares: [],
                        target: {
                            ...input.target,
                            physicalDefense: 100,
                            spellDefense: 100,
                            reflects: [{ rate: 1, tags: ["fire"], channel: DefenseChannel.Spell }],
                            thorns: [
                                {
                                    amount: 50,
                                    tags: ["physical"],
                                    channel: DefenseChannel.Physical,
                                },
                            ],
                        },
                    },
                    round,
                );
                check(
                    reflected.reactions.length === 0 &&
                        !reflected.critical &&
                        reflected.leech === 0 &&
                        reflected.crushDamage === 0,
                );
                near(reflected.recipients[0].lifeLoss, event.parts[0].amount / 2);
            }
        },
    },
    {
        name: "撕裂跳過物防且不能暴擊、吸血與壓碎",
        run(round) {
            const input = flameInput();
            const result = run(
                {
                    ...input,
                    shares: [],
                    event: {
                        ...input.event,
                        kind: DamageKind.Dot,
                        bleed: true,
                        parts: [part(100, "bleed")],
                    },
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.CritChance, 0.5),
                            modifier(DamageStat.Leech, 1),
                            modifier(DamageStat.CrushChance, 1),
                            modifier(DamageStat.CrushRate, 1),
                        ],
                    },
                    target: {
                        life: 1000,
                        maxLife: 1000,
                        physicalDefense: 10000,
                        modifiers: [modifier(DamageStat.Resistance, 0.2, ["bleed"])],
                    },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 80);
            check(!result.critical && result.leech === 0 && result.crushDamage === 0);
        },
    },
    {
        name: "生命百分比傷害讀取基準與剩餘施放額度並正常防禦",
        run(round) {
            const input = simpleInput();
            for (const basis of ["current", "maximum", "missing"] as const) {
                const result = run(
                    {
                        ...input,
                        event: {
                            ...input.event,
                            healthDamage: { basis, rate: 0.5, remaining: 150 },
                        },
                        target: { life: 200, maxLife: 1000, physicalDefense: 100 },
                    },
                    round,
                );
                near(result.healthDamageUsed, basis === "current" ? 100 : 150);
                near(result.recipients[0].lifeLoss, basis === "current" ? 50 : 75);
            }
        },
    },
    {
        name: "固定傷害仍經普通防禦且生命百分比傷害可以擊殺",
        run(round) {
            const input = simpleInput();
            near(
                run(
                    { ...input, target: { life: 1000, maxLife: 1000, physicalDefense: 100 } },
                    round,
                ).recipients[0].lifeLoss,
                50,
            );
            const killed = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        healthDamage: { basis: "current", rate: 1, remaining: 1000 },
                    },
                },
                round,
            );
            check(killed.killed);
        },
    },
    {
        name: "無視減傷逐項跳過且禁止暴擊、偷取與反射",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    rolls: { crit: true },
                    event: {
                        ...input.event,
                        ignoreReduction: [
                            "defense",
                            "resistance",
                            "reduction",
                            "flat",
                            "absorption",
                            "vulnerability",
                        ],
                    },
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.CritChance, 0.5),
                            modifier(DamageStat.Leech, 1),
                        ],
                    },
                    target: {
                        ...input.target,
                        physicalDefense: 10000,
                        modifiers: [
                            modifier(DamageStat.Resistance, 0.75),
                            modifier(DamageStat.Reduction, 0.8),
                            modifier(DamageStat.FlatReduction, 50),
                            modifier(DamageStat.Absorption, 0.4),
                            modifier(DamageStat.FlatAbsorption, 20),
                            modifier(DamageStat.Vulnerability, 1),
                        ],
                        reflects: [{ rate: 1, tags: ["fire"], channel: DefenseChannel.Spell }],
                        shields: [{ id: "shield", capacity: 30 }],
                    },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 70);
            check(!result.critical && result.leech === 0 && result.reactions.length === 0);
            const partial = run(
                {
                    ...input,
                    event: { ...input.event, ignoreReduction: ["defense"] },
                    target: {
                        ...input.target,
                        physicalDefense: 10000,
                        modifiers: [modifier(DamageStat.Resistance, 0.5)],
                    },
                },
                round,
            );
            near(partial.recipients[0].lifeLoss, 50);
        },
    },
    {
        name: "施法穩定使用實際生命損失且不套用一般檢定上限",
        run(round) {
            const input = simpleInput(100);
            const result = run(
                { ...input, target: { ...input.target, castingStability: 5 } },
                round,
            );
            near(result.stabilityCheck!, 105);
            check(result.damageBreak);
        },
    },
    {
        name: "二級屬性驗證符文學者與巡檢機",
        run() {
            const player = deriveCombatStats(scholar, { armor: scholar.armor });
            const enemy = deriveCombatStats(patrolMachine, { armor: patrolMachine.armor });
            near(player.maxLife, 42);
            near(enemy.maxLife, 62);
            near(player.meleeAttack, 8);
            near(player.rangedAttack, 10);
            near(player.physicalDefense, 2);
            near(player.spellDefense, 18);
            near(player.critChance, 0.07);
            near(player.critDamage, 2.04);
            near(player.evasion, 2);
            near(player.attackSpeed, 0.2);
            near(player.castingStability, 5);
            near(enemy.meleeAttack, 10);
            near(enemy.rangedAttack, 8);
            near(enemy.physicalDefense, 22);
            near(enemy.spellDefense, 8);
            near(scholar.weapon.base + player.meleeAttack * scholar.weapon.coefficient, 8);
            near(
                patrolMachine.weapon.base + enemy.meleeAttack * patrolMachine.weapon.coefficient,
                13.5,
            );
            check(
                patrolMachine.attackShape.length === 160 && patrolMachine.attackShape.width === 80,
            );
        },
    },
    {
        name: "二級屬性全部加成與上限",
        run() {
            const result = deriveCombatStats(
                { ...scholar, luck: 100 },
                {
                    maxLife: 100000,
                    meleeAttack: 3,
                    rangedAttack: 4,
                    armor: 5,
                    protection: 6,
                    physicalDefense: 7,
                    spellDefense: 8,
                    critChance: 1,
                    critDamage: 5,
                    evasion: 9,
                    attackSpeed: 2,
                    castingStability: 10,
                },
            );
            near(result.maxLife, 100000);
            near(result.meleeAttack, 11);
            near(result.rangedAttack, 14);
            near(result.physicalDefense, 14);
            near(result.spellDefense, 32);
            near(result.critChance, 0.5);
            near(result.critDamage, 3);
            near(result.evasion, 11);
            near(result.attackSpeed, 1);
            near(result.castingStability, 15);
            check(attributeModifier(100000) === 10 && attributeModifier(-1) === 0);
        },
    },
    {
        name: "通用檢定與技能檢定共用二至十九範圍",
        run() {
            const input = { challenge: 1, adverse: 2, level: 1, attribute: 2, favorable: 0 };
            near(generalCheckValue(input), 11);
            for (const value of [-100, 100]) {
                near(generalCheckValue({ ...input, adverse: value }), value < 0 ? 2 : 19);
                near(
                    checkValue({ ...input, adverse: value, knowledge: 0, complexity: 2 }),
                    value < 0 ? 2 : 19,
                );
            }
            check(!rollCheck(11, () => 11).success && rollCheck(11, () => 12).success);
        },
    },
    {
        name: "玩家失能、敵人擊倒與明確恢復",
        run() {
            for (const role of ["player", "enemy"] as const) {
                const original = createCombatLife(role, 42, 42, 10);
                const down = updateCombatLife(original, 0, 0);
                check(
                    down.incapacitated === (role === "player") &&
                        down.knockedDown === (role === "enemy"),
                );
                check(recoverCombatLife(down, 20) === down);
                const revived = reviveCombatLife(down, 10);
                check(!revived.incapacitated && !revived.knockedDown && revived.life === 10);
                near(recoverCombatLife(revived, 100).life, 42);
                near(original.life, 42);
                near(original.shield, 10);
            }
        },
    },
    {
        name: "生命與護盾夾限及重複套用快照",
        run() {
            const state = createCombatLife("player", 200000, -1, 200000);
            near(state.maxLife, 100000);
            near(state.life, 0);
            near(state.shield, 100000);
            const first = updateCombatLife(state, 12, 4);
            const second = updateCombatLife(first, 12, 4);
            near(second.life, 12);
            near(second.shield, 4);
        },
    },
);

combatCases.push(
    {
        name: "聯合上限依事件總量判斷，混合傷害不額外放大",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: { ...input.event, parts: [part(100), part(100, "fire", "none")] },
                    target: {
                        ...input.target,
                        physicalDefense: 10000,
                        modifiers: [
                            modifier(DamageStat.Resistance, 0.75, ["physical"]),
                            modifier(DamageStat.Reduction, 0.8, ["physical"]),
                            modifier(DamageStat.Resistance, -1, ["fire"]),
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[15].state), 201);
        },
    },
    {
        name: "分攤接收者以分攤事件匹配護盾",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    shares: [
                        {
                            target: "guardian",
                            rate: 0.5,
                            state: {
                                ...input.target,
                                shields: [
                                    { id: "share-only", capacity: 30, kind: DamageKind.Share },
                                ],
                            },
                        },
                    ],
                },
                round,
            );
            near(result.recipients[1].shieldConsumed, 30);
            near(result.recipients[1].lifeLoss, 20);
        },
    },
    {
        name: "獨立分攤事件只接受護盾與死亡保護",
        run(round) {
            const input = flameInput();
            const result = run(
                {
                    ...input,
                    event: { ...input.event, kind: DamageKind.Share, parts: [part(100)] },
                    target: { ...input.target, immuneTags: ["physical"] },
                    shares: [{ target: "other", rate: 0.5, state: input.target }],
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 50);
            check(
                result.recipients.length === 1 &&
                    !result.critical &&
                    result.leech === 0 &&
                    result.reactions.length === 0,
            );
        },
    },
    {
        name: "獨立壓碎事件接受抗性、護盾與最低一生命",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        kind: DamageKind.Crush,
                        parts: [part(100, "crush", "none")],
                    },
                    target: {
                        life: 20,
                        maxLife: 100,
                        modifiers: [modifier(DamageStat.CrushResistance, 0.2)],
                        shields: [{ id: "shield", capacity: 10, kind: DamageKind.Crush }],
                    },
                },
                round,
            );
            near(result.crushDamage, 80);
            near(result.crushShieldConsumed, 10);
            near(result.crushLifeLoss, 19);
            near(result.targetLife, 1);
        },
    },
    {
        name: "獨立壓碎事件在免疫時完全移除",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: { ...input.event, kind: DamageKind.Crush },
                    target: { ...input.target, crushImmune: true },
                },
                round,
            );
            near(result.crushLifeLoss, 0);
            near(result.recipients[0].lifeLoss, 0);
        },
    },
    {
        name: "暴擊原倍率上限百分之三百",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    attacker: {
                        modifiers: [
                            modifier(DamageStat.CritChance, 1),
                            modifier(DamageStat.CritDamage, 10),
                        ],
                    },
                    rolls: { crit: true },
                },
                round,
            );
            near(sum(result.trace[10].state), 300);
        },
    },
    {
        name: "多標籤以最高匹配抗性處理",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        parts: [{ ...part(100), tags: ["physical", "fire"] }],
                    },
                    target: {
                        ...input.target,
                        modifiers: [
                            modifier(DamageStat.Resistance, 0.1, ["physical"]),
                            modifier(DamageStat.Resistance, 0.5, ["fire"]),
                        ],
                    },
                },
                round,
            );
            near(result.recipients[0].lifeLoss, 50);
        },
    },
    {
        name: "較強流血取代、較弱保留、同強度刷新",
        run() {
            const initial = selectBleedingWound(undefined, {
                source: "one",
                damage: 10,
                remainingTicks: 3000,
            });
            const weaker = selectBleedingWound(initial, {
                source: "two",
                damage: 5,
                remainingTicks: 5000,
            });
            check(weaker === initial);
            const equal = selectBleedingWound(initial, {
                source: "two",
                damage: 10,
                remainingTicks: 5000,
            });
            check(equal.source === "one" && equal.damage === 10 && equal.remainingTicks === 5000);
            const stronger = selectBleedingWound(initial, {
                source: "two",
                damage: 20,
                remainingTicks: 4000,
            });
            check(stronger.source === "two" && stronger.damage === 20);
        },
    },
    {
        name: "週期快照不鎖定目標免疫，也不保留基礎公式",
        run(round) {
            const input = simpleInput();
            const event = {
                ...input.event,
                kind: DamageKind.Dot,
                canCrit: false,
                parts: [{ ...part(10, "fire", "spell"), power: 20, coefficient: 0.5 }],
            };
            const parts = snapshotDamageOffense({
                event,
                target: { ...input.target, immuneTags: ["fire"] },
                round,
                attacker: { modifiers: [modifier(DamageStat.Increase, 0.5)] },
            });
            near(parts[0].amount, 30);
            const tick = run({ ...input, event: { ...event, parts } }, round);
            near(tick.recipients[0].lifeLoss, 30);
        },
    },
    {
        name: "持續週期不自動取得直接命中附傷",
        run(round) {
            const input = simpleInput();
            const event = { ...input.event, kind: DamageKind.Dot };
            const result = run(
                {
                    ...input,
                    event,
                    attacker: {
                        added: [
                            part(50, "fire", "spell"),
                            { ...part(10, "frost", "spell"), match: { kind: DamageKind.Dot } },
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[4].state), 110);
        },
    },
    {
        name: "非近戰或沒有接觸的事件不觸發荊棘",
        run(round) {
            const input = simpleInput();
            for (const event of [
                { ...input.event, output: DamageOutput.Spell },
                { ...input.event, contact: false },
            ]) {
                const result = run(
                    {
                        ...input,
                        event,
                        target: {
                            ...input.target,
                            thorns: [
                                { amount: 7, tags: ["physical"], channel: DefenseChannel.Physical },
                            ],
                        },
                    },
                    round,
                );
                check(result.reactions.length === 0);
            }
        },
    },
    {
        name: "生命百分比可保留明列強度係數及其他傷害部分",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        parts: [
                            { ...part(0), power: 20, coefficient: 0.5 },
                            part(10, "fire", "spell"),
                        ],
                        healthDamage: { basis: "current", rate: 0.1, remaining: 1000 },
                    },
                },
                round,
            );
            near(result.healthDamageUsed, 100);
            near(result.recipients[0].lifeLoss, 120);
        },
    },
);

combatCases.push(
    {
        name: "獨立壓碎在護盾前套用壓碎抗性",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    event: {
                        ...input.event,
                        kind: DamageKind.Crush,
                        parts: [part(100, "crush", DefenseChannel.None)],
                    },
                    target: {
                        ...input.target,
                        modifiers: [modifier(DamageStat.CrushResistance, 0.2, ["crush"])],
                        shields: [{ id: "shield", capacity: 10 }],
                    },
                },
                round,
            );
            near(result.crushDamage, 80);
            near(result.crushShieldConsumed, 10);
            near(result.crushLifeLoss, 70);
        },
    },
    {
        name: "轉換同優先級保持宣告順序，未列優先級排在最後",
        run(round) {
            const input = simpleInput();
            const result = run(
                {
                    ...input,
                    attacker: {
                        conversions: [
                            {
                                from: "physical",
                                rate: 0.8,
                                tags: ["unlisted"],
                                channel: DefenseChannel.Spell,
                            },
                            {
                                from: "physical",
                                rate: 0.6,
                                priority: 1,
                                tags: ["first"],
                                channel: DefenseChannel.Spell,
                            },
                            {
                                from: "physical",
                                rate: 0.6,
                                priority: 1,
                                tags: ["second"],
                                channel: DefenseChannel.Spell,
                            },
                        ],
                    },
                },
                round,
            );
            near(sum(result.trace[6].state, "first"), 60);
            near(sum(result.trace[6].state, "second"), 40);
            near(sum(result.trace[6].state, "unlisted"), 0);
        },
    },
    {
        name: "原本已倒地的目標不重複產生擊殺",
        run(round) {
            const input = simpleInput();
            const result = run({ ...input, target: { ...input.target, life: 0 } }, round);
            check(result.recipients[0].knockedDown && !result.killed);
        },
    },
);

combatCases.push({
    name: "無視減傷只在明列格擋層時跳過格擋",
    run(round) {
        const input = simpleInput();
        const target = {
            ...input.target,
            physicalDefense: 10000,
            modifiers: [
                modifier(DamageStat.BlockChance, 0.75),
                modifier(DamageStat.BlockValue, 20),
            ],
        };
        const blocked = run(
            {
                ...input,
                target,
                rolls: { block: true },
                event: { ...input.event, ignoreReduction: [ReductionLayer.Defense] },
            },
            round,
        );
        near(blocked.recipients[0].lifeLoss, 80);
        const skipped = run(
            {
                ...input,
                target,
                rolls: { block: true },
                event: {
                    ...input.event,
                    ignoreReduction: [ReductionLayer.Block, ReductionLayer.Defense],
                },
            },
            round,
        );
        near(skipped.recipients[0].lifeLoss, 100);
    },
});

for (const sample of [
    { name: "近戰距離小於上限時命中", distance: 171.5, hit: true },
    { name: "近戰距離等於上限時命中", distance: 172, hit: true },
    { name: "近戰距離大於上限時閃避", distance: 172.5, hit: false },
]) {
    const input = sample;
    combatCases.push({
        name: input.name,
        run(round) {
            const result = meleeReach(
                {
                    distance: input.distance,
                    attackRange: 100,
                    attackerCollision: 16,
                    targetCollision: 24,
                    tolerance: 32,
                },
                round,
            );
            near(result.limit, 172);
            check(result.hit === input.hit);
        },
    });
}

export function verifyCombat(): number {
    for (const item of combatCases) {
        try {
            item.run();
        } catch (error) {
            throw new Error(`${item.name}。${(error as { message: string }).message}`);
        }
    }
    return combatCases.length;
}
