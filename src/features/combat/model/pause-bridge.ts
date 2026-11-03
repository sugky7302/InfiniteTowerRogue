import { Clock, Subscription } from "@shared/rxwc3";

/** 暫停轉接需要的原生操作。WC3 實作由 `@shared/wc3-def` 的單位與技能介面提供。 */
export interface ResourceNatives<U> {
    cooldown(target: U, ability: number): number;
    startCooldown(target: U, ability: number, seconds: number): void;
    disableAbility(target: U, ability: number, disabled: boolean): void;
    mana(target: U): number;
    setMana(target: U, value: number): void;
    regen(target: U): number;
    setRegen(target: U, value: number): void;
}

/**
 * @param isCasting 單位是否正在施法。暫停時不停用正在施法單位的任何技能，也不結束其冷卻：
 *   停用正在引導的技能，或停用同一單位的其他技能，都會使施法被判定為中斷（S3 第二、三次驗證，2026-11-03）。
 *   這些技能在暫停期間的冷卻仍會前進，恢復時以保存的剩餘時間校正。
 */
export function installPauseBridge<U>(
    clock: Clock,
    natives: ResourceNatives<U>,
    units: readonly U[],
    abilities: readonly number[],
    isCasting: (this: void, unit: U) => boolean = () => false,
): Subscription {
    const owner = new Subscription();
    let saved: {
        unit: U;
        mana: number;
        regen: number;
        cooldowns: number[];
        disabled: boolean[];
    }[] = [];
    const trackedUnits = [...new Set(units)];
    const trackedAbilities = [...new Set(abilities)];
    const restore = (): void => {
        const states = saved;
        saved = [];
        for (const state of states) {
            natives.setMana(state.unit, state.mana);
            natives.setRegen(state.unit, state.regen);
            for (let index = 0; index < trackedAbilities.length; index++) {
                const ability = trackedAbilities[index];
                // 每筆快照只配對本系統的一次停用。外部的停用計數仍然保留。
                if (state.disabled[index]) natives.disableAbility(state.unit, ability, false);
                natives.startCooldown(state.unit, ability, state.cooldowns[index]);
            }
        }
    };
    const change = (paused: boolean): void => {
        if (!paused) {
            restore();
            return;
        }
        saved = trackedUnits.map((unit) => {
            const casting = isCasting(unit);
            return {
                unit,
                mana: natives.mana(unit),
                regen: natives.regen(unit),
                cooldowns: trackedAbilities.map((ability) => natives.cooldown(unit, ability)),
                disabled: trackedAbilities.map(() => !casting),
            };
        });
        for (const state of saved) {
            natives.setRegen(state.unit, 0);
            for (let index = 0; index < trackedAbilities.length; index++) {
                if (!state.disabled[index]) continue;
                const ability = trackedAbilities[index];
                natives.startCooldown(state.unit, ability, 0);
                natives.disableAbility(state.unit, ability, true);
            }
        }
    };
    owner.add(clock.pauseChanges.subscribe(change));
    owner.add(restore);
    if (clock.isPaused()) change(true);
    return owner;
}
