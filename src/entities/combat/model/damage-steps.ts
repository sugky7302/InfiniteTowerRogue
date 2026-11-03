import { combatAdd, combatMultiply, combatNumber, clampCombat } from "./combat-number";
import {
    DamageKind,
    DamageHistory,
    DefenseChannel,
    DamageOutput,
    DamageEvent,
    DamageInput,
    DamageMatch,
    DamageModifier,
    DamagePart,
    DamageRecipient,
    DamageResult,
    DamageShield,
    DamageStat,
    DamageState,
    DamageTarget,
    ReductionLayer,
} from "./damage-event";

function roundValue(state: DamageState, value: number): number {
    return combatNumber(state.input.round?.(combatNumber(value)) ?? value);
}
function addValue(state: DamageState, a: number, b: number): number {
    return roundValue(state, combatAdd(roundValue(state, a), roundValue(state, b)));
}
function multiplyValue(state: DamageState, a: number, b: number): number {
    return roundValue(state, combatMultiply(roundValue(state, a), roundValue(state, b)));
}
function total(state: DamageState, parts: readonly DamagePart[]): number {
    let value = 0;
    for (const part of parts) value = addValue(state, value, part.amount);
    return value;
}
function matches(
    state: DamageState,
    part: DamagePart,
    match: DamageMatch,
    original = false,
): boolean {
    const event = state.input.event;
    return (
        (match.output === undefined || match.output === event.output) &&
        (match.kind === undefined || match.kind === event.kind) &&
        (match.skill === undefined || match.skill === event.skill) &&
        (match.channel === undefined || match.channel === part.channel) &&
        (match.tags === undefined ||
            match.tags.some(
                (tag) =>
                    part.tags.includes(tag) ||
                    (original && (part.originalTags?.includes(tag) ?? false)),
            ))
    );
}
function modifiers(
    state: DamageState,
    stat: DamageStat,
    side: "attacker" | "target",
): readonly DamageModifier[] {
    const list =
        side === "attacker" ? state.input.attacker?.modifiers : state.input.target.modifiers;
    return (list ?? []).filter((item) => item.stat === stat);
}
function matching(
    state: DamageState,
    part: DamagePart,
    stat: DamageStat,
    side: "attacker" | "target",
    original = false,
): DamageModifier[] {
    const seen: string[] = [];
    return modifiers(state, stat, side).filter((item) => {
        if (seen.includes(item.id) || !matches(state, part, item, original)) return false;
        seen.push(item.id);
        return true;
    });
}
function modifierValue(
    state: DamageState,
    part: DamagePart,
    stat: DamageStat,
    side: "attacker" | "target",
    original = false,
): number {
    let result = 0;
    for (const item of matching(state, part, stat, side, original))
        result = addValue(state, result, item.value);
    return result;
}
function eventValue(state: DamageState, stat: DamageStat, side: "attacker" | "target"): number {
    const seen: string[] = [];
    let result = 0;
    for (const item of modifiers(state, stat, side)) {
        if (seen.includes(item.id) || !state.parts.some((part) => matches(state, part, item)))
            continue;
        seen.push(item.id);
        result = addValue(state, result, item.value);
    }
    return result;
}
function mapAmounts(
    state: DamageState,
    change: (this: void, part: DamagePart, index: number) => number,
): DamageState {
    return {
        ...state,
        parts: state.parts.map((part, index) => ({
            ...part,
            amount: Math.max(0, roundValue(state, change(part, index))),
        })),
    };
}
function skips(state: DamageState, layer: ReductionLayer): boolean {
    return (
        state.input.event.kind === DamageKind.Crush ||
        state.input.event.kind === DamageKind.Share ||
        (state.input.event.ignoreReduction?.includes(layer) ?? false)
    );
}
function ordinary(state: DamageState): boolean {
    return (
        state.input.event.kind === DamageKind.Direct || state.input.event.kind === DamageKind.Dot
    );
}
function canHitProc(state: DamageState): boolean {
    return (
        state.active &&
        state.input.event.kind === DamageKind.Direct &&
        !state.input.event.bleed &&
        state.input.event.ignoreReduction === undefined &&
        total(state, state.parts) > 0
    );
}
function succeeds(state: DamageState, kind: "crit" | "block" | "crush", chance: number): boolean {
    return chance > 0 && (state.input.rolls?.[kind] ?? state.input.roll?.(kind, chance) ?? false);
}
/** 按當時占比分攤。最後一部分接收剩餘額度。 */
function deduct(
    state: DamageState,
    parts: readonly DamagePart[],
    amount: number,
    match: DamageMatch = {},
): DamagePart[] {
    const eligible = parts.filter((part) => part.amount > 0 && matches(state, part, match));
    const sum = total(state, eligible);
    const budget = Math.min(sum, Math.max(0, roundValue(state, amount)));
    const after = Math.max(0, addValue(state, sum, -budget));
    let kept = 0;
    let index = 0;
    return parts.map((part) => {
        if (!eligible.includes(part)) return part;
        index++;
        const retained =
            index === eligible.length
                ? Math.max(0, addValue(state, after, -kept))
                : Math.max(
                      0,
                      addValue(
                          state,
                          part.amount,
                          -multiplyValue(state, budget, roundValue(state, part.amount / sum)),
                      ),
                  );
        kept = addValue(state, kept, retained);
        return { ...part, amount: retained };
    });
}
function absorbShields(
    state: DamageState,
    parts: readonly DamagePart[],
    shields: readonly DamageShield[],
) {
    let pending = parts;
    let consumed = 0;
    const result = shields.map((shield) => {
        const before = total(state, pending);
        pending = deduct(state, pending, shield.capacity, shield);
        const used = Math.max(0, addValue(state, before, -total(state, pending)));
        consumed = addValue(state, consumed, used);
        return { ...shield, capacity: Math.max(0, addValue(state, shield.capacity, -used)) };
    });
    return { parts: pending, shields: result, consumed };
}
export function createDamageState(input: DamageInput): DamageState {
    const maxLife = clampCombat(input.target.maxLife, 0, 100000);
    return {
        input,
        parts: input.event.parts.map((part) => ({
            ...part,
            tags: [...part.tags],
            amount: Math.max(0, combatNumber(part.amount)),
        })),
        active: true,
        critical: false,
        blocked: false,
        crushDamage: 0,
        crushLifeLoss: 0,
        crushShieldConsumed: 0,
        targetLife: clampCombat(input.target.life, 0, maxLife),
        shields: (input.target.shields ?? []).map((shield) => ({
            ...shield,
            capacity: Math.max(0, combatNumber(shield.capacity)),
        })),
        defenseBase: [],
        effectiveDefenses: [],
        resistances: [],
        recipients: [],
        leech: 0,
        reactions: [],
        damageBreak: false,
        shieldHit: false,
        shieldBroken: false,
        killed: false,
        healthDamageUsed: 0,
    };
}

/** 第 1 步。外部先完成技能、資源與互動矩陣驗證。 */
export function validateDamage(state: DamageState): DamageState {
    const event = state.input.event;
    if (event.healthDamage?.basis === "maximum" && event.ignoreReduction !== undefined) {
        throw new Error("最大生命傷害不能搭配無視減傷。");
    }
    const targets: unknown[] = [event.target];
    for (const share of state.input.shares ?? []) {
        if (targets.includes(share.target)) throw new Error("分攤承受者不得重複。");
        targets.push(share.target);
    }
    const active = state.input.gates?.valid !== false;
    return { ...state, active, parts: active ? state.parts : [] };
}
/** 第 2 步。接受呼叫者依知識產生的標籤。 */
export function generateDamage(state: DamageState): DamageState {
    const active = state.active && state.input.gates?.generated !== false;
    return { ...state, active, parts: active ? state.parts : [] };
}
/** 第 3 步。攔截後的承受者已寫入輸入，再接受命中與迴避結果。 */
export function hitDamage(state: DamageState): DamageState {
    const active = state.active && state.input.gates?.hit !== false;
    return { ...state, active, parts: active ? state.parts : [] };
}
/** 第 4 步。武器係數可預先放入 base，效果強度使用 power 與 coefficient。 */
export function baseDamage(state: DamageState): DamageState {
    if (!state.active) return state;
    const health = state.input.event.healthDamage;
    if (health !== undefined) {
        const target = state.input.target;
        const maximum = clampCombat(target.maxLife, 0, 100000);
        const basis =
            health.basis === "current"
                ? state.targetLife
                : health.basis === "maximum"
                  ? maximum
                  : addValue(state, maximum, -state.targetLife);
        const amount = Math.min(
            Math.max(0, roundValue(state, health.remaining)),
            multiplyValue(state, basis, clampCombat(health.rate, 0, 1)),
        );
        // 百分比額度只加入第一部分。明列的強度係數與其他部分照常計算。
        return {
            ...state,
            parts: state.parts.map((part, index) => {
                const { base, power, coefficient, ...settled } = part;
                return {
                    ...settled,
                    amount: Math.max(
                        0,
                        addValue(
                            state,
                            index === 0 ? amount : (base ?? part.amount),
                            multiplyValue(state, power ?? 0, coefficient ?? 0),
                        ),
                    ),
                };
            }),
            healthDamageUsed: amount,
        };
    }
    return {
        ...state,
        parts: state.parts.map((part) => {
            const { base, power, coefficient, ...settled } = part;
            return {
                ...settled,
                amount: Math.max(
                    0,
                    addValue(
                        state,
                        base ?? part.amount,
                        multiplyValue(state, power ?? 0, coefficient ?? 0),
                    ),
                ),
            };
        }),
    };
}
/** 第 5 步。持續週期與衍生事件不自動取得命中附傷。 */
export function addDamage(state: DamageState): DamageState {
    if (!state.active || !ordinary(state)) return state;
    const added = (state.input.attacker?.added ?? []).filter((part) =>
        state.parts.some((base) => matches(state, base, part.match ?? { kind: DamageKind.Direct })),
    );
    return {
        ...state,
        parts: [
            ...state.parts,
            ...added.map((part) => {
                const { base, power, coefficient, match, ...fixed } = part;
                return {
                    ...fixed,
                    tags: [...part.tags],
                    amount: Math.max(0, roundValue(state, part.amount)),
                    history: DamageHistory.Added,
                };
            }),
        ],
    };
}
/** 第 6 步。全部額外獲得都讀取相同的轉換前快照。 */
export function gainDamage(state: DamageState): DamageState {
    if (!state.active || !ordinary(state)) return state;
    const gained: DamagePart[] = [];
    for (const gain of state.input.attacker?.gains ?? []) {
        const amount = multiplyValue(
            state,
            total(
                state,
                state.parts.filter((part) => part.tags.includes(gain.from)),
            ),
            Math.max(0, roundValue(state, gain.rate)),
        );
        gained.push({
            amount,
            tags: [...gain.tags],
            channel: gain.channel,
            history: DamageHistory.Gained,
        });
    }
    return { ...state, parts: [...state.parts, ...gained] };
}
/** 第 7 步。每個來源類型只轉換一次，不形成轉換循環。 */
export function convertDamage(state: DamageState): DamageState {
    if (!state.active || !ordinary(state)) return state;
    const parts: DamagePart[] = [];
    for (const part of state.parts) {
        const ordered = (state.input.attacker?.conversions ?? [])
            .map((conversion, index) => ({ conversion, index }))
            .filter((item) => part.tags.includes(item.conversion.from));
        const prioritized = ordered.some((item) => item.conversion.priority !== undefined);
        if (prioritized) {
            ordered.sort((a, b) => {
                const left = combatNumber(a.conversion.priority ?? 2147483520);
                const right = combatNumber(b.conversion.priority ?? 2147483520);
                return left === right ? a.index - b.index : left < right ? -1 : 1;
            });
        }
        const conversions = ordered.map((item) => item.conversion);
        let rateSum = 0;
        for (const item of conversions)
            rateSum = addValue(state, rateSum, Math.max(0, roundValue(state, item.rate)));
        let rateLeft = 1;
        let amountLeft = part.amount;
        const converted: DamagePart[] = [];
        for (const item of conversions) {
            const requested = Math.max(0, roundValue(state, item.rate));
            const rate = Math.min(
                rateLeft,
                prioritized ? requested : roundValue(state, requested / Math.max(1, rateSum)),
            );
            const amount =
                rate === rateLeft
                    ? amountLeft
                    : Math.min(amountLeft, multiplyValue(state, part.amount, rate));
            rateLeft = Math.max(0, addValue(state, rateLeft, -rate));
            amountLeft = Math.max(0, addValue(state, amountLeft, -amount));
            if (amount > 0)
                converted.push({
                    ...part,
                    amount,
                    tags: [...item.tags],
                    channel: item.channel,
                    history: DamageHistory.Converted,
                    originalTags: part.originalTags ?? part.tags,
                });
        }
        if (amountLeft > 0) parts.push({ ...part, amount: amountLeft });
        parts.push(...converted);
    }
    return { ...state, parts };
}
/** 第 8 步。只比對最終標籤。 */
export function immuneDamage(state: DamageState): DamageState {
    if (state.input.event.kind === DamageKind.Share) return state;
    return {
        ...state,
        parts: state.parts.filter(
            (part) => !part.tags.some((tag) => state.input.target.immuneTags?.includes(tag)),
        ),
    };
}
/** 第 9 步。負的 increase 表示降低。 */
export function increaseDamage(state: DamageState): DamageState {
    if (!ordinary(state)) return state;
    return mapAmounts(state, (part) =>
        multiplyValue(
            state,
            part.amount,
            Math.max(
                0,
                addValue(
                    state,
                    1,
                    modifierValue(state, part, DamageStat.Increase, "attacker", true),
                ),
            ),
        ),
    );
}
/** 第 10 步。每個 more 都是一個獨立乘區。 */
export function multiplyDamage(state: DamageState): DamageState {
    if (!ordinary(state)) return state;
    return mapAmounts(state, (part) => {
        let amount = part.amount;
        for (const item of matching(state, part, DamageStat.More, "attacker", true))
            amount = multiplyValue(state, amount, Math.max(0, addValue(state, 1, item.value)));
        return amount;
    });
}
/** 第 11 步。一次效果只判定一次暴擊。 */
export function criticalDamage(state: DamageState): DamageState {
    const event = state.input.event;
    if (
        !ordinary(state) ||
        !event.canCrit ||
        event.bleed ||
        event.ignoreReduction !== undefined ||
        state.input.target.critImmune ||
        total(state, state.parts) <= 0
    )
        return state;
    const chance = Math.max(
        0,
        addValue(
            state,
            clampCombat(eventValue(state, DamageStat.CritChance, "attacker"), 0, 0.5),
            -clampCombat(eventValue(state, DamageStat.CritAvoidance, "target"), 0, 0.5),
        ),
    );
    if (!succeeds(state, "crit", chance)) return state;
    const critical = clampCombat(
        addValue(state, 2, eventValue(state, DamageStat.CritDamage, "attacker")),
        1,
        3,
    );
    const multiplier = addValue(
        state,
        1,
        multiplyValue(
            state,
            addValue(state, critical, -1),
            addValue(
                state,
                1,
                -clampCombat(eventValue(state, DamageStat.CritReduction, "target"), 0, 0.75),
            ),
        ),
    );
    return {
        ...mapAmounts(state, (part) => multiplyValue(state, part.amount, Math.max(1, multiplier))),
        critical: true,
    };
}
/** 第 12 步。衍生事件與持續週期不再判定格擋。 */
export function blockDamage(state: DamageState): DamageState {
    if (
        !state.active ||
        state.input.event.kind !== DamageKind.Direct ||
        state.input.event.bleed ||
        total(state, state.parts) <= 0 ||
        skips(state, ReductionLayer.Block) ||
        !succeeds(
            state,
            "block",
            clampCombat(eventValue(state, DamageStat.BlockChance, "target"), 0, 0.75),
        )
    )
        return state;
    return {
        ...state,
        parts: deduct(state, state.parts, eventValue(state, DamageStat.BlockValue, "target")),
        blocked: true,
    };
}
/** 第 13 步。壓碎先消耗匹配護盾，再把生命最多降至 1。 */
export function crushDamage(state: DamageState): DamageState {
    const explicit = state.input.event.kind === DamageKind.Crush;
    if (state.input.target.crushImmune || state.input.target.immuneTags?.includes("crush"))
        return explicit ? { ...state, parts: [] } : state;
    if (
        !explicit &&
        (!canHitProc(state) ||
            !succeeds(
                state,
                "crush",
                clampCombat(eventValue(state, DamageStat.CrushChance, "attacker"), 0, 1),
            ))
    )
        return state;
    const raw = explicit
        ? total(state, state.parts)
        : multiplyValue(
              state,
              state.targetLife,
              clampCombat(eventValue(state, DamageStat.CrushRate, "attacker"), 0, 1),
          );
    const rawCrush: DamagePart = {
        amount: raw,
        tags: ["crush"],
        channel: DefenseChannel.None,
        history: DamageHistory.Base,
    };
    const crushState = {
        ...state,
        parts: [rawCrush],
        input: { ...state.input, event: { ...state.input.event, kind: DamageKind.Crush } },
    };
    const amount = multiplyValue(
        state,
        raw,
        addValue(
            state,
            1,
            -clampCombat(eventValue(crushState, DamageStat.CrushResistance, "target"), 0, 1),
        ),
    );
    const shield = absorbShields(crushState, [{ ...rawCrush, amount }], state.shields);
    const loss = Math.min(
        Math.max(0, addValue(state, state.targetLife, -1)),
        total(state, shield.parts),
    );
    return {
        ...state,
        parts: explicit ? [] : state.parts,
        crushDamage: amount,
        crushLifeLoss: loss,
        crushShieldConsumed: shield.consumed,
        targetLife: addValue(state, state.targetLife, -loss),
        shields: shield.shields,
    };
}
/** 第 14 步。每個部分只有一個防禦通道。 */
export function defendDamage(state: DamageState): DamageState {
    const effective: number[] = [];
    const defenseBase = state.parts.map((part) => part.amount);
    const next = mapAmounts(state, (part) => {
        if (
            skips(state, ReductionLayer.Defense) ||
            part.channel === DefenseChannel.None ||
            (state.input.event.bleed && part.channel === DefenseChannel.Physical)
        ) {
            effective.push(0);
            return part.amount;
        }
        let defense =
            part.channel === DefenseChannel.Physical
                ? (state.input.target.physicalDefense ?? 0)
                : part.channel === DefenseChannel.Spell
                  ? (state.input.target.spellDefense ?? 0)
                  : 0;
        defense = addValue(
            state,
            multiplyValue(
                state,
                defense,
                Math.max(
                    0,
                    addValue(
                        state,
                        addValue(
                            state,
                            1,
                            modifierValue(state, part, DamageStat.DefenseIncrease, "target"),
                        ),
                        -modifierValue(state, part, DamageStat.DefenseReduction, "target"),
                    ),
                ),
            ),
            -modifierValue(state, part, DamageStat.DefenseFlatReduction, "target"),
        );
        defense = Math.max(
            0,
            addValue(
                state,
                multiplyValue(
                    state,
                    defense,
                    Math.max(
                        0,
                        addValue(
                            state,
                            1,
                            -modifierValue(state, part, DamageStat.Penetration, "attacker"),
                        ),
                    ),
                ),
                -modifierValue(state, part, DamageStat.FlatPenetration, "attacker"),
            ),
        );
        effective.push(defense);
        const reduction = Math.min(0.8, roundValue(state, defense / addValue(state, defense, 100)));
        return multiplyValue(state, part.amount, addValue(state, 1, -reduction));
    });
    return { ...next, defenseBase, effectiveDefenses: effective };
}
/** 第 15 步。多標籤使用最高的匹配抗性。 */
export function resistDamage(state: DamageState): DamageState {
    const resistances: number[] = [];
    const next = mapAmounts(state, (part) => {
        if (skips(state, ReductionLayer.Resistance)) {
            resistances.push(0);
            return part.amount;
        }
        let resistance = -1;
        for (const tag of part.tags.length > 0 ? part.tags : [""]) {
            const tagged = { ...part, tags: [tag] };
            const cap = clampCombat(
                addValue(
                    state,
                    0.75,
                    modifierValue(state, tagged, DamageStat.ResistanceCap, "target"),
                ),
                0,
                0.9,
            );
            const current = clampCombat(
                addValue(
                    state,
                    addValue(
                        state,
                        modifierValue(state, tagged, DamageStat.Resistance, "target"),
                        -modifierValue(state, tagged, DamageStat.ResistanceReduction, "target"),
                    ),
                    -modifierValue(state, tagged, DamageStat.ElementPenetration, "attacker"),
                ),
                -1,
                cap,
            );
            resistance = Math.max(resistance, current);
        }
        resistances.push(resistance);
        return multiplyValue(state, part.amount, addValue(state, 1, -resistance));
    });
    return { ...next, resistances };
}
/** 第 16 步。事件總額保留進入廣泛防禦前的至少 5%。 */
export function reduceDamage(state: DamageState): DamageState {
    if (skips(state, ReductionLayer.Reduction)) return state;
    const reduced = mapAmounts(state, (part) =>
        multiplyValue(
            state,
            part.amount,
            addValue(
                state,
                1,
                -clampCombat(modifierValue(state, part, DamageStat.Reduction, "target"), 0, 0.8),
            ),
        ),
    );
    let before = 0;
    for (const amount of state.defenseBase) before = addValue(state, before, amount);
    const floor = multiplyValue(state, before, 0.05);
    const sum = total(state, reduced.parts);
    if (sum >= floor || floor <= 0) return reduced;
    let remaining = floor;
    const parts = reduced.parts.map((part, index) => {
        const amount =
            index === reduced.parts.length - 1
                ? remaining
                : Math.min(
                      remaining,
                      multiplyValue(
                          state,
                          floor,
                          roundValue(
                              state,
                              sum > 0 ? part.amount / sum : state.defenseBase[index] / before,
                          ),
                      ),
                  );
        remaining = Math.max(0, addValue(state, remaining, -amount));
        return { ...part, amount };
    });
    return { ...reduced, parts };
}
/** 第 17 步。同一固定減傷來源每個事件只扣一次。 */
export function flatReduceDamage(state: DamageState): DamageState {
    if (skips(state, ReductionLayer.Flat)) return state;
    let parts = state.parts;
    const seen: string[] = [];
    for (const item of modifiers(state, DamageStat.FlatReduction, "target")) {
        if (seen.includes(item.id)) continue;
        seen.push(item.id);
        parts = deduct(state, parts, item.value, item);
    }
    return { ...state, parts };
}
/** 第 18 步。先套用百分比，再扣除每個固定吸收池。 */
export function absorbDamage(state: DamageState): DamageState {
    if (skips(state, ReductionLayer.Absorption)) return state;
    let next = mapAmounts(state, (part) =>
        multiplyValue(
            state,
            part.amount,
            addValue(
                state,
                1,
                -clampCombat(modifierValue(state, part, DamageStat.Absorption, "target"), 0, 0.4),
            ),
        ),
    );
    const seen: string[] = [];
    for (const item of modifiers(state, DamageStat.FlatAbsorption, "target")) {
        if (seen.includes(item.id)) continue;
        seen.push(item.id);
        next = { ...next, parts: deduct(state, next.parts, item.value, item) };
    }
    return next;
}
/** 第 19 步。易傷不能重建已免疫的部分。 */
export function vulnerableDamage(state: DamageState): DamageState {
    if (skips(state, ReductionLayer.Vulnerability)) return state;
    return mapAmounts(state, (part) =>
        multiplyValue(
            state,
            part.amount,
            addValue(
                state,
                1,
                clampCombat(modifierValue(state, part, DamageStat.Vulnerability, "target"), 0, 1),
            ),
        ),
    );
}
function recipient(
    target: unknown,
    state: DamageTarget,
    parts: readonly DamagePart[],
    life: number,
    shields: readonly DamageShield[],
): DamageRecipient {
    return {
        target,
        state,
        parts,
        life,
        shields,
        shieldConsumed: 0,
        lifeLoss: 0,
        prevented: false,
        executed: false,
        knockedDown: false,
    };
}
/** 第 20 步。多個分攤依輸入順序截斷，總率最高 100%。 */
export function shareDamage(state: DamageState): DamageState {
    let remaining = state.parts;
    let rateLeft = 1;
    const recipients: DamageRecipient[] = [];
    for (const share of state.input.event.kind === DamageKind.Share ||
    state.input.event.kind === DamageKind.Crush
        ? []
        : (state.input.shares ?? [])) {
        const rate = Math.min(rateLeft, clampCombat(share.rate, 0, 1));
        const moved = state.parts.map((part, index) => ({
            ...part,
            amount:
                rate === rateLeft
                    ? remaining[index].amount
                    : Math.min(remaining[index].amount, multiplyValue(state, part.amount, rate)),
        }));
        remaining = remaining.map((part, index) => ({
            ...part,
            amount: Math.max(0, addValue(state, part.amount, -moved[index].amount)),
        }));
        rateLeft = Math.max(0, addValue(state, rateLeft, -rate));
        recipients.push(
            recipient(
                share.target,
                share.state,
                moved,
                clampCombat(share.state.life, 0, clampCombat(share.state.maxLife, 0, 100000)),
                share.state.shields ?? [],
            ),
        );
    }
    return {
        ...state,
        parts: remaining,
        recipients: [
            recipient(
                state.input.event.target,
                state.input.target,
                remaining,
                state.targetLife,
                state.shields,
            ),
            ...recipients,
        ],
    };
}
/** 第 21 步。各承受者分別消耗匹配護盾。 */
export function shieldDamage(state: DamageState): DamageState {
    return {
        ...state,
        recipients: state.recipients.map((item, index) => {
            const recipientState =
                index === 0
                    ? state
                    : {
                          ...state,
                          input: {
                              ...state.input,
                              event: {
                                  ...state.input.event,
                                  kind: DamageKind.Share,
                                  target: item.target,
                              },
                          },
                      };
            const absorbed = absorbShields(recipientState, item.parts, item.shields);
            return {
                ...item,
                parts: absorbed.parts,
                shields: absorbed.shields,
                shieldConsumed: absorbed.consumed,
            };
        }),
    };
}
/** 第 22 步。生命損失不包含溢出。 */
export function loseDamageLife(state: DamageState): DamageState {
    return {
        ...state,
        recipients: state.recipients.map((item) => {
            const loss = Math.min(item.life, total(state, item.parts));
            return {
                ...item,
                lifeLoss: loss,
                life: Math.max(0, addValue(state, item.life, -loss)),
            };
        }),
    };
}
/** 第 23 步。保命、替身與階段轉換均可阻止本次斬殺。 */
export function preventDamageDeath(state: DamageState): DamageState {
    return {
        ...state,
        recipients: state.recipients.map((item) => {
            if (
                item.life > 0 ||
                item.lifeLoss <= 0 ||
                (!item.state.deathImmune && item.state.preventDeath === undefined)
            )
                return item;
            const life = clampCombat(
                item.state.preventDeath?.life ?? 1,
                1,
                clampCombat(item.state.maxLife, 1, 100000),
            );
            return {
                ...item,
                life,
                prevented: true,
                lifeLoss: Math.max(
                    0,
                    addValue(state, item.lifeLoss, -Math.min(life, item.lifeLoss)),
                ),
            };
        }),
    };
}
/** 第 24 步。只有合格直接傷害的原目標可斬殺。 */
export function executeDamage(state: DamageState): DamageState {
    if (!canHitProc(state)) return state;
    const threshold = clampCombat(eventValue(state, DamageStat.Execute, "attacker"), 0, 0.1);
    return {
        ...state,
        recipients: state.recipients.map((item, index) => {
            if (
                index !== 0 ||
                item.prevented ||
                item.state.preventDeath !== undefined ||
                item.state.deathImmune ||
                item.state.executeImmune ||
                item.lifeLoss <= 0 ||
                item.life <= 0 ||
                item.life >= multiplyValue(state, item.state.maxLife, threshold)
            )
                return item;
            return { ...item, life: 0, executed: true };
        }),
    };
}
function reactionEvent(
    state: DamageState,
    kind: "reflect" | "thorns",
    amount: number,
    tags: readonly string[],
    channel: "physical" | "spell" | "none",
): DamageEvent {
    return {
        source: state.input.event.target,
        target: state.input.event.source,
        kind,
        output: state.input.event.output,
        canCrit: false,
        parts: [{ amount, tags: [...tags], channel, history: DamageHistory.Base }],
    };
}
/** 第 25 步。偷取與反射只讀取原目標的主傷害生命損失。 */
export function followDamage(state: DamageState): DamageState {
    const loss = state.recipients[0]?.lifeLoss ?? 0;
    if (loss <= 0) return state;
    const leech =
        canHitProc(state) && !state.input.attacker?.recoveryForbidden
            ? multiplyValue(
                  state,
                  multiplyValue(
                      state,
                      loss,
                      Math.max(0, eventValue(state, DamageStat.Leech, "attacker")),
                  ),
                  addValue(
                      state,
                      1,
                      -clampCombat(
                          eventValue(state, DamageStat.RecoveryReduction, "attacker"),
                          0,
                          0.8,
                      ),
                  ),
              )
            : 0;
    const reactions = [...state.reactions];
    const event = state.input.event;
    if (
        (event.kind === DamageKind.Direct || event.kind === DamageKind.Dot) &&
        !event.bleed &&
        event.ignoreReduction === undefined
    ) {
        for (const reflect of state.input.target.reflects ?? []) {
            const amount = multiplyValue(
                state,
                loss,
                Math.max(0, roundValue(state, reflect.rate ?? 0)),
            );
            if (amount > 0)
                reactions.push(
                    reactionEvent(state, DamageKind.Reflect, amount, reflect.tags, reflect.channel),
                );
        }
    }
    return {
        ...state,
        leech,
        reactions,
        damageBreak: true,
        stabilityCheck:
            state.input.target.castingStability === undefined
                ? undefined
                : addValue(state, addValue(state, 10, loss), -state.input.target.castingStability),
    };
}
/** 第 26 步。荊棘只要求近戰接觸。反射與荊棘都不能連鎖。 */
export function finishDamage(state: DamageState): DamageState {
    const reactions = [...state.reactions];
    if (
        state.active &&
        state.input.event.kind === DamageKind.Direct &&
        state.input.event.output === DamageOutput.Melee &&
        state.input.event.contact
    ) {
        for (const thorns of state.input.target.thorns ?? []) {
            const amount = Math.max(0, roundValue(state, thorns.amount ?? 0));
            if (amount > 0)
                reactions.push(
                    reactionEvent(state, DamageKind.Thorns, amount, thorns.tags, thorns.channel),
                );
        }
    }
    const recipients = state.recipients.map((item) => ({ ...item, knockedDown: item.life <= 0 }));
    let shieldHit = state.crushShieldConsumed > 0;
    let shieldBroken = false;
    for (const item of recipients) {
        shieldHit = shieldHit || item.shieldConsumed > 0;
        for (const shield of item.shields) {
            const before = item.state.shields?.find((entry) => entry.id === shield.id);
            if (before !== undefined && before.capacity > 0 && shield.capacity <= 0)
                shieldBroken = true;
        }
    }
    const primary = recipients[0];
    return {
        ...state,
        recipients,
        reactions,
        shieldHit,
        shieldBroken,
        killed: (primary?.knockedDown ?? false) && state.input.target.life > 0,
        targetLife: primary?.life ?? state.targetLife,
        shields: primary?.shields ?? state.shields,
    };
}

export const damageSteps = [
    validateDamage,
    generateDamage,
    hitDamage,
    baseDamage,
    addDamage,
    gainDamage,
    convertDamage,
    immuneDamage,
    increaseDamage,
    multiplyDamage,
    criticalDamage,
    blockDamage,
    crushDamage,
    defendDamage,
    resistDamage,
    reduceDamage,
    flatReduceDamage,
    absorbDamage,
    vulnerableDamage,
    shareDamage,
    shieldDamage,
    loseDamageLife,
    preventDamageDeath,
    executeDamage,
    followDamage,
    finishDamage,
] as const;

export function settleDamage(input: DamageInput): DamageResult {
    let state = createDamageState(input);
    const trace = [];
    for (let index = 0; index < damageSteps.length; index++) {
        state = damageSteps[index](state);
        trace.push({ step: index + 1, state });
    }
    return { ...state, trace };
}

/** 週期建立時鎖定輸出。免疫與其他目標減傷留在每次週期處理。 */
export function snapshotDamageOffense(input: DamageInput): readonly DamagePart[] {
    let state = createDamageState(input);
    for (const step of [
        baseDamage,
        addDamage,
        gainDamage,
        convertDamage,
        increaseDamage,
        multiplyDamage,
        criticalDamage,
    ])
        state = step(state);
    return state.parts;
}
