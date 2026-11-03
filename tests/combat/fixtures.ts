import {
    DamageHistory,
    DamageKind,
    DamageOutput,
    DamageInput,
    DamageModifier,
    DamagePart,
    DamageStat,
    DefenseChannel,
} from "@entities/combat";

export function modifier(
    stat: DamageStat,
    value: number,
    tags?: readonly string[],
    channel?: DefenseChannel,
): DamageModifier {
    return {
        id: `${stat}-${tags?.join("-") ?? "all"}-${channel ?? "all"}`,
        stat,
        value,
        tags,
        channel,
    };
}
export function part(
    amount: number,
    tag = "physical",
    channel: DefenseChannel = DefenseChannel.Physical,
): DamagePart {
    return { amount, tags: [tag], channel, history: DamageHistory.Base };
}
export function simpleInput(amount = 100): DamageInput {
    return {
        event: {
            source: "attacker",
            target: "target",
            kind: DamageKind.Direct,
            output: DamageOutput.Melee,
            canCrit: true,
            contact: true,
            skill: "test",
            parts: [part(amount)],
        },
        target: { life: 1000, maxLife: 1000 },
    };
}
export function flameInput(round?: (this: void, value: number) => number): DamageInput {
    return {
        round,
        event: {
            source: "attacker",
            target: "target",
            kind: DamageKind.Direct,
            output: DamageOutput.Melee,
            canCrit: true,
            contact: true,
            skill: "flame-slash",
            parts: [{ ...part(80), power: 40, coefficient: 0.5 }],
        },
        attacker: {
            added: [{ ...part(20, "fire", "spell"), history: DamageHistory.Added }],
            gains: [{ from: "physical", rate: 0.2, tags: ["fire"], channel: DefenseChannel.Spell }],
            conversions: [
                { from: "physical", rate: 0.5, tags: ["fire"], channel: DefenseChannel.Spell },
            ],
            modifiers: [
                { ...modifier(DamageStat.Increase, 0.2), skill: "flame-slash" },
                modifier(DamageStat.Increase, 0.3, ["fire"]),
                modifier(DamageStat.More, 0.2),
                modifier(DamageStat.CritChance, 0.25),
                modifier(DamageStat.CrushChance, 0.2),
                modifier(DamageStat.CrushRate, 0.1),
                modifier(DamageStat.Leech, 0.1),
                modifier(DamageStat.Penetration, 0.25, undefined, "physical"),
                modifier(DamageStat.FlatPenetration, 15, undefined, "physical"),
                modifier(DamageStat.Penetration, 0.2, undefined, "spell"),
                modifier(DamageStat.FlatPenetration, 10, undefined, "spell"),
                modifier(DamageStat.ElementPenetration, 0.15, ["fire"]),
                modifier(DamageStat.Execute, 0.1),
            ],
        },
        target: {
            life: 1000,
            maxLife: 1000,
            shields: [{ id: "target-shield", capacity: 50 }],
            physicalDefense: 150,
            spellDefense: 120,
            modifiers: [
                modifier(DamageStat.DefenseReduction, 0.2, undefined, "physical"),
                modifier(DamageStat.DefenseFlatReduction, 10, undefined, "physical"),
                modifier(DamageStat.DefenseReduction, 0.1, undefined, "spell"),
                modifier(DamageStat.DefenseFlatReduction, 8, undefined, "spell"),
                modifier(DamageStat.Resistance, 0.1, ["physical"]),
                modifier(DamageStat.Resistance, 0.6, ["fire"]),
                modifier(DamageStat.ResistanceReduction, 0.2, ["fire"]),
                modifier(DamageStat.CritAvoidance, 0.05),
                modifier(DamageStat.CritReduction, 0.25),
                modifier(DamageStat.BlockChance, 0.75),
                modifier(DamageStat.BlockValue, 40),
                modifier(DamageStat.Reduction, 0.1),
                modifier(DamageStat.FlatReduction, 10),
                modifier(DamageStat.Absorption, 0.2, ["fire"]),
                modifier(DamageStat.FlatAbsorption, 5, ["fire"]),
                modifier(DamageStat.Vulnerability, 0.2, ["physical"]),
                modifier(DamageStat.Vulnerability, 0.1, ["fire"]),
                modifier(DamageStat.CrushResistance, 0.2),
            ],
            reflects: [{ rate: 0.2, tags: ["fire"], channel: DefenseChannel.Spell }],
            castingStability: 5,
        },
        shares: [
            {
                target: "guardian",
                rate: 0.25,
                state: {
                    life: 1000,
                    maxLife: 1000,
                    shields: [{ id: "guardian-shield", capacity: 20 }],
                },
            },
        ],
        rolls: { crit: true, block: true, crush: true },
    };
}
