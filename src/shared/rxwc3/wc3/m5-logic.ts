import { DamagingEvent, SpellEvent } from "@shared/wc3-def";
import { Observable } from "../core/observable";
import { pipe } from "../core/pipe";
import { Subscription } from "../core/subscription";
import { map } from "../operators/map";
import { switchMap } from "../operators/switch-map";
import { takeUntil } from "../operators/take-until";
import { Clock } from "../scheduler/clock";
import { worldClock } from "../scheduler/clocks";
import { Phase } from "../scheduler/phase";
import { computed, effect, signal } from "../signal";
import { timer } from "../sources/timer";
import { onSpellEndCast } from "./events";

// 範例專用邏輯，不從 RxWC3 入口匯出。測試注入相同形狀的事件來源及時鐘。
export function whenCastCompleted(
    caster: unit,
    delay: number,
    endCast: { of(unit: unit): Observable<SpellEvent> } = onSpellEndCast,
    clock: Clock = worldClock,
) {
    return pipe(
        switchMap((event: SpellEvent) =>
            timer(delay, { clock, phase: Phase.Combat }).pipe(
                takeUntil(endCast.of(caster)),
                map(() => event),
            ),
        ),
    );
}

// 修改只能留在同步傷害事件中。先訂閱增傷，再訂閱護盾；不使用時間 operator。
export function installShieldExample(
    owner: Subscription,
    damaging: Observable<DamagingEvent>,
    log: (this: void, message: string) => void,
) {
    const shield = signal(100);
    const depleted = computed(() => shield() === 0);
    owner.add(
        effect(() => {
            if (depleted()) log("M5 護盾耗盡。");
        }),
    );
    owner.add(
        damaging.subscribe((event) => {
            if (event.amount <= 0) return;
            const before = event.amount;
            event.setAmount(before * 2);
            log(`M5 增傷：${before} → ${event.amount}`);
        }),
    );
    owner.add(
        damaging.subscribe((event) => {
            if (event.amount <= 0) return;
            const before = event.amount;
            const absorbed = Math.min(before, shield());
            const remaining = shield() - absorbed;
            event.setAmount(before - absorbed);
            log(
                `M5 護盾：傷害 ${before}，吸收 ${absorbed}，剩餘 ${remaining}，傷害傳出 ${event.amount}`,
            );
            shield.set(remaining);
        }),
    );
    return { shield: shield.asReadOnly(), depleted };
}
