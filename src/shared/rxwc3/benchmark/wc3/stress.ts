import { FileReadStatus } from "../../../file-io";
import { logger } from "../../../logger";
import { EventNatives, wc3EventNatives } from "@shared/wc3-def";
import { createWc3Events, Subscription } from "../../index";
import { attempt, median, observationalGoal, ratio, readNumber } from "../metrics";
import { parseRecords, resultValue } from "../results";
import { Mode } from "../workloads";
import { Output } from "./runtime";
import { CallbackMeter } from "./timers";

export function runStress(output: Output, owner: Subscription, mode: Mode, soak: boolean): void {
    const duration = soak ? 300 : 30;
    const name = `bench-${soak ? "soak" : "stress"}-${mode}`;
    const meter = new CallbackMeter(output);
    const units: unit[] = [];
    const members = new Set<unit>();
    const triggers: trigger[] = [];
    const subscriptions = new Subscription();
    const first = Player(bj_PLAYER_NEUTRAL_EXTRA)!;
    const second = Player(PLAYER_NEUTRAL_AGGRESSIVE)!;
    const allianceA = GetPlayerAlliance(first, second, ALLIANCE_PASSIVE);
    const allianceB = GetPlayerAlliance(second, first, ALLIANCE_PASSIVE);
    const viewer = Player(0)!;
    const isolation = [
        { from: first, to: viewer },
        { from: viewer, to: first },
        { from: second, to: viewer },
        { from: viewer, to: second },
    ].map((pair) => ({
        ...pair,
        passive: GetPlayerAlliance(pair.from, pair.to, ALLIANCE_PASSIVE),
    }));
    let beforeCount = 0;
    let afterCount = 0;
    let checksum = 0;
    let tick = -5;
    let seconds = 0;
    let segments = 0;
    let completed = false;
    let previousUs: number | undefined = 0;
    let previousAllocation: number | undefined = 0;
    let previousNet: number | undefined = 0;
    let totalUs: number | undefined = output.capabilities.timed ? 0 : undefined;
    let totalAllocation: number | undefined = output.capabilities.pauseGc ? 0 : undefined;
    let totalEvents = 0;
    let totalHits = 0;
    let memorySamples = 0;
    let memoryStart: number | undefined;
    let memoryEnd: number | undefined;
    let buffer: string[] = [];
    // 先配置固定容量，避免結果陣列持續擴張污染記憶體趨勢。
    const times: number[] = [];
    const rates: number[] = [];
    for (let index = 0; index < duration; index++) {
        times.push(0);
        rates.push(0);
    }
    let allTimed = output.capabilities.timed;
    const flush = (): void => {
        if (buffer.length === 0) return;
        segments++;
        output.write(`${name}-s${segments}`, buffer);
        buffer = [];
    };
    const sampleMemory = (): void => {
        const raw = readNumber(output.functions.memory);
        const collected = output.capabilities.collect && attempt(output.functions.collect);
        const retained = collected ? readNumber(output.functions.memory) : undefined;
        const row = output.row({
            type: "memory",
            second: seconds,
            raw_kb: resultValue(raw),
            retained_kb: resultValue(retained),
            collected,
            events: totalEvents,
            hits: totalHits,
        });
        if (memorySamples === 0) memoryStart = retained;
        memoryEnd = retained;
        output.write(`${name}-m${memorySamples}`, [row]);
        memorySamples++;
    };
    const finalize = (): void => {
        flush();
        const cpuMs = totalUs === undefined ? undefined : totalUs / 1000;
        const own = seconds > 0 && allTimed ? median(times.slice(0, seconds)) : undefined;
        let other: number | undefined;
        let otherCpu: number | undefined;
        let otherPerEvent: number | undefined;
        const opposite = mode === "rx" ? "native" : "rx";
        const saved = output.files.read(
            `InfiniteTowerRogue\\bench-${soak ? "soak" : "stress"}-${opposite}.pld`,
        );
        if (completed && saved.status === FileReadStatus.Read) {
            try {
                for (const row of parseRecords(saved.data)) {
                    if (
                        row.type === "summary" &&
                        row.fixture === "1" &&
                        row.completed === "true" &&
                        row.seconds === `${duration}` &&
                        row.mode === opposite
                    ) {
                        other = readNumber(() => Number(row.median_ms_s));
                        otherCpu = readNumber(() => Number(row.cpu_ms));
                        otherPerEvent = readNumber(() => Number(row.ms_event));
                    }
                }
            } catch {
                logger.warn("另一組的結果無法解析，倍數保留為無法判定。");
            }
        }
        const rx = mode === "rx" ? own : other;
        const native = mode === "native" ? own : other;
        const ownPerEvent =
            cpuMs === undefined || totalEvents === 0 ? undefined : cpuMs / totalEvents;
        const rxPerEvent = mode === "rx" ? ownPerEvent : otherPerEvent;
        const nativePerEvent = mode === "native" ? ownPerEvent : otherPerEvent;
        output.write(name, [
            output.metadata(),
            output.row({
                type: "config",
                id: soak ? "B6" : "B5",
                mode,
                units: units.length,
                warmup_s: 5,
                duration_s: duration,
                cooldown_s: 0.65,
                fixture: 1,
                scope: "capture_dispatch_handlers",
                segments,
                memory_samples: memorySamples,
            }),
            output.row({
                type: "summary",
                fixture: 1,
                mode,
                completed,
                seconds,
                events: totalEvents,
                hits: totalHits,
                cpu_ms: resultValue(cpuMs),
                ms_event: resultValue(
                    cpuMs === undefined || totalEvents === 0 ? undefined : cpuMs / totalEvents,
                ),
                alloc_kb_event: resultValue(
                    totalAllocation === undefined || totalEvents === 0
                        ? undefined
                        : totalAllocation / totalEvents,
                ),
                net_kb_event: resultValue(
                    meter.netKb === undefined || totalEvents === 0
                        ? undefined
                        : meter.netKb / totalEvents,
                ),
                median_hits_s: resultValue(
                    seconds > 0 ? median(rates.slice(0, seconds)) : undefined,
                ),
                median_ms_s: resultValue(own),
                rx_ms_s: resultValue(rx),
                native_ms_s: resultValue(native),
                ratio: resultValue(ratio(rx, native)),
                rx_ms: resultValue(mode === "rx" ? cpuMs : otherCpu),
                native_ms: resultValue(mode === "native" ? cpuMs : otherCpu),
                rx_ms_event: resultValue(rxPerEvent),
                native_ms_event: resultValue(nativePerEvent),
                ratio_event: resultValue(ratio(rxPerEvent, nativePerEvent)),
                memory_start_kb: resultValue(memoryStart),
                memory_end_kb: resultValue(memoryEnd),
                comparison: other === undefined ? "missing_pair" : "separate_run",
                checksum,
            }),
            output.row({
                type: "goal",
                id: "G1",
                status: observationalGoal(),
                reason: "requires_20_subscribers_B1",
            }),
            output.row({
                type: "goal",
                id: "G2",
                status: observationalGoal(),
                reason: "requires_visual_observation",
            }),
            output.row({
                type: "goal",
                id: "G3",
                status: observationalGoal(),
                reason: "requires_trend_analysis",
            }),
            output.row({
                type: "goal",
                id: "G4",
                status: observationalGoal(),
                reason: "requires_B4",
            }),
        ]);
    };
    // 先停止事件來源與任務，再寫出結果及移除單位。初始化失敗也可以清理。
    const pulse = CreateTimer();
    owner.add(() => {
        PauseTimer(pulse);
        DestroyTimer(pulse);
        subscriptions.unsubscribe();
        for (const trigger of triggers) DestroyTrigger(trigger);
        try {
            finalize();
        } finally {
            for (const unit of units) RemoveUnit(unit);
            SetPlayerAlliance(first, second, ALLIANCE_PASSIVE, allianceA);
            SetPlayerAlliance(second, first, ALLIANCE_PASSIVE, allianceB);
            for (const pair of isolation)
                SetPlayerAlliance(pair.from, pair.to, ALLIANCE_PASSIVE, pair.passive);
        }
    });
    SetPlayerAlliance(first, second, ALLIANCE_PASSIVE, false);
    SetPlayerAlliance(second, first, ALLIANCE_PASSIVE, false);
    for (const pair of isolation) SetPlayerAlliance(pair.from, pair.to, ALLIANCE_PASSIVE, true);
    const register = (kind: "damaging" | "damaged", callback: (this: void) => void): trigger => {
        const trigger = CreateTrigger();
        triggers.push(trigger);
        TriggerAddAction(trigger, () => {
            const target = GetTriggerUnit();
            if (target === undefined || !members.has(target)) return;
            try {
                meter.measure(callback);
            } catch (error) {
                logger.error(error);
                owner.unsubscribe();
            }
        });
        TriggerRegisterAnyUnitEventBJ(
            trigger,
            kind === "damaging" ? EVENT_PLAYER_UNIT_DAMAGING : EVENT_PLAYER_UNIT_DAMAGED,
        );
        return trigger;
    };
    if (mode === "rx") {
        // 使用獨立公開工廠。只包裝原生邊界以量測與清理，不改變分發行為。
        const natives: EventNatives = {
            ...wc3EventNatives,
            createTrigger: () => {
                const trigger = CreateTrigger();
                triggers.push(trigger);
                return trigger;
            },
            addAction: (trigger, callback) => {
                TriggerAddAction(trigger, () => {
                    const target = GetTriggerUnit();
                    if (target === undefined || !members.has(target)) return;
                    try {
                        meter.measure(callback);
                    } catch (error) {
                        logger.error(error);
                        owner.unsubscribe();
                    }
                });
            },
        };
        const events = createWc3Events(natives);
        subscriptions.add(
            events.onDamaging.subscribe((event) => {
                beforeCount++;
                event.setAmount(event.amount / 2);
            }),
        );
        subscriptions.add(
            events.onDamaged.subscribe((event) => {
                afterCount++;
                checksum = (checksum + Math.floor(event.amount)) % 10000;
            }),
        );
    } else {
        register("damaging", () => {
            beforeCount++;
            BlzSetEventDamage(GetEventDamage() / 2);
        });
        register("damaged", () => {
            afterCount++;
            checksum = (checksum + Math.floor(GetEventDamage())) % 10000;
        });
    }
    // 兩邊各 100 個。每對相距 64，兩邊都接到原生攻擊命令。
    for (let index = 0; index < 100; index++) {
        const x = (index % 10) * 110 - 500;
        const y = Math.floor(index / 10) * 110 - 500;
        for (let side = 0; side < 2; side++) {
            const unit = CreateUnit(
                side === 0 ? first : second,
                FourCC("hfoo"),
                x + side * 64,
                y,
                side === 0 ? 0 : 180,
            );
            if (unit === undefined) throw new Error("混戰無法建立測試單位。");
            units.push(unit);
            members.add(unit);
            SetUnitPathing(unit, false);
            SetUnitCreepGuard(unit, false);
            RemoveGuardPosition(unit);
            BlzSetUnitMaxHP(unit, 1000000);
            SetWidgetLife(unit, 1000000);
            BlzSetUnitAttackCooldown(unit, 0.65, 0);
        }
    }
    const order = (): void => {
        for (let index = 0; index < 100; index++) {
            IssueTargetOrder(units[index * 2], "attack", units[index * 2 + 1]);
            IssueTargetOrder(units[index * 2 + 1], "attack", units[index * 2]);
        }
    };
    order();
    TimerStart(pulse, 1, true, () => {
        if (owner.closed) return;
        try {
            tick++;
            if (tick < 0) return;
            if (tick === 0) {
                beforeCount = 0;
                afterCount = 0;
                meter.us = output.capabilities.timed ? 0 : undefined;
                meter.allocation = output.capabilities.pauseGc ? 0 : undefined;
                meter.netKb = output.capabilities.memory ? 0 : undefined;
                previousUs = meter.us;
                previousAllocation = meter.allocation;
                previousNet = meter.netKb;
                sampleMemory();
                logger.info("混戰暖身完成，開始記錄。");
                return;
            }
            seconds = tick;
            const events = beforeCount + afterCount;
            const us =
                meter.us === undefined || previousUs === undefined
                    ? undefined
                    : meter.us - previousUs;
            const allocation =
                meter.allocation === undefined || previousAllocation === undefined
                    ? undefined
                    : meter.allocation - previousAllocation;
            const net =
                meter.netKb === undefined || previousNet === undefined
                    ? undefined
                    : meter.netKb - previousNet;
            previousUs = meter.us;
            previousAllocation = meter.allocation;
            previousNet = meter.netKb;
            totalEvents += events;
            totalHits += afterCount;
            totalUs = meter.us;
            totalAllocation = meter.allocation;
            if (us === undefined) allTimed = false;
            times[tick - 1] = us === undefined ? 0 : us / 1000;
            rates[tick - 1] = afterCount;
            buffer.push(
                output.row({
                    type: "second",
                    second: tick,
                    damaging: beforeCount,
                    damaged: afterCount,
                    events,
                    hits: afterCount,
                    cpu_ms: resultValue(us === undefined ? undefined : us / 1000),
                    ms_event: resultValue(
                        us === undefined || events === 0 ? undefined : us / 1000 / events,
                    ),
                    alloc_kb_event: resultValue(
                        allocation === undefined || events === 0 ? undefined : allocation / events,
                    ),
                    net_kb_event: resultValue(
                        net === undefined || events === 0 ? undefined : net / events,
                    ),
                }),
            );
            logger.info(
                `${soak ? "B6" : "B5"} ${mode} ${tick} 秒：命中 ${afterCount}，通知 ${events}，處理 ${us === undefined ? "無法量測" : us / 1000} ms。`,
            );
            beforeCount = 0;
            afterCount = 0;
            if (tick % 30 === 0) {
                flush();
                sampleMemory();
            }
            if (tick >= duration) {
                completed = true;
                owner.unsubscribe();
                logger.info("混戰量測完成，單位與事件已清理。");
            }
        } catch (error) {
            logger.error(error);
            owner.unsubscribe();
        }
    });
    logger.info(
        `${soak ? "B6" : "B5"} ${mode}：200 個單位，先暖身 5 秒，再量測 ${duration} 秒。請觀察畫面是否掉幀。`,
    );
}
