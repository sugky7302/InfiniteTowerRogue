import { Clock, Phase, Subscription } from "@shared/lib/rxwc3";
import { UnitOrderEvent } from "@shared/lib/wc3-def";
import { Combatant, CombatRegistry } from "./registry";

interface MotionSnapshot {
    readonly unit: unit;
    speed: number;
    readonly weapons: boolean[];
}

/** 方法 2。每個登錄單位的動作速度只由此介面設定。 */
export class TacticalPause {
    public readonly owner = new Subscription();
    private readonly saved = new Map<unit, MotionSnapshot>();
    private readonly orders = new Map<unit, UnitOrderEvent>();
    private issuing = false;
    public constructor(
        private readonly registry: CombatRegistry,
        private readonly clock: Clock,
    ) {
        this.owner.add(clock.pauseChanges.subscribe((paused) => this.change(paused)));
        this.owner.add(
            registry.registrations.subscribe((state) => {
                if (clock.isPaused()) this.freeze(state);
            }),
        );
        this.owner.add(() => this.restore(false));
        if (clock.isPaused()) this.change(true);
    }
    public setTimeScale(target: unit, value: number): void {
        this.registry.require(target).timeScale = value;
        this.registry.natives.timeScale(target, this.clock.isPaused() ? 0 : value);
    }
    /** 技能減速也透過此介面。暫停時更新保存值，原生速度仍為 0。 */
    public setSpeed(target: unit, value: number): void {
        const saved = this.saved.get(target);
        if (saved !== undefined) saved.speed = value;
        else this.registry.natives.setSpeed(target, value);
    }
    public speed(target: unit): number {
        return this.saved.get(target)?.speed ?? this.registry.natives.speed(target);
    }
    public order(event: UnitOrderEvent): void {
        if (this.issuing || !this.registry.units.has(event.unit)) return;
        const state = this.registry.require(event.unit);
        if (state.profile.weapon === undefined && this.requiresWeapon(event)) {
            this.registry.natives.text(event.unit, "沒有武器");
            this.stop(event.unit);
            return;
        }
        if (!this.registry.active(event.unit)) {
            this.stop(event.unit);
            return;
        }
        if (!this.clock.isPaused() || state.life.role !== "player") return;
        this.orders.set(event.unit, event);
        // 清除引擎命令，避免恢復時先執行較早命令。
        this.stop(event.unit);
    }
    /** 右鍵敵人使用 smart 命令。右鍵友軍仍可跟隨。 */
    private requiresWeapon(event: UnitOrderEvent): boolean {
        if (event.orderId === 851983) return true;
        if (event.orderId !== 851971 || event.kind !== "target" || event.target === undefined)
            return false;
        const target = this.registry.units.get(event.target as unit);
        return target !== undefined && target.faction !== this.registry.require(event.unit).faction;
    }
    /** 本系統的停止命令不覆蓋玩家保存的命令。 */
    public stop(target: unit): void {
        this.issuing = true;
        try {
            this.registry.natives.stop(target);
        } catch (error) {
            this.issuing = false;
            throw error;
        }
        this.issuing = false;
    }
    private freeze(state: Combatant): void {
        const n = this.registry.natives,
            target = state.unit;
        if (this.saved.has(target) || n.unitType(target) === 0) return;
        const snapshot = {
            unit: target,
            speed: n.speed(target),
            weapons: [n.weaponEnabled(target, 0), n.weaponEnabled(target, 1)],
        };
        // 先保存完整快照。部分寫入失敗時仍可還原。
        this.saved.set(target, snapshot);
        n.timeScale(target, 0);
        n.setSpeed(target, 0);
        n.setWeaponEnabled(target, 0, false);
        n.setWeaponEnabled(target, 1, false);
    }
    private change(paused: boolean): void {
        if (paused) for (const state of this.registry.units.values()) this.freeze(state);
        else this.restore(true);
    }
    public restore(replay = true): void {
        const n = this.registry.natives;
        for (const state of this.saved.values()) {
            if (n.unitType(state.unit) !== 0) {
                const combatant = this.registry.require(state.unit);
                const down = combatant.life.knockedDown;
                n.setWeaponEnabled(state.unit, 1, down ? false : state.weapons[1]);
                n.setWeaponEnabled(state.unit, 0, down ? false : state.weapons[0]);
                n.setSpeed(state.unit, down ? 0 : state.speed);
                n.timeScale(state.unit, combatant.timeScale);
            }
            // 還原失敗時，該筆與後續快照仍在，呼叫者可以重試。
            this.saved.delete(state.unit);
        }
        if (!replay) {
            this.orders.clear();
            return;
        }
        if (this.orders.size === 0) return;
        // 零延遲任務在 pauseChanges 分發完成後執行。技能資源轉接先還原技能。
        const task = this.clock.schedule(
            0,
            () => {
                this.owner.remove(task);
                this.replayOrders();
            },
            Phase.Combat,
        );
        this.owner.add(task);
    }
    private replayOrders(): void {
        const orders = [...this.orders.values()];
        this.orders.clear();
        const n = this.registry.natives;
        this.issuing = true;
        try {
            for (const order of orders) {
                const target = order.target as unit | undefined;
                if (
                    this.registry.active(order.unit) &&
                    !(
                        this.requiresWeapon(order) &&
                        this.registry.require(order.unit).profile.weapon === undefined
                    ) &&
                    !(
                        target !== undefined &&
                        this.registry.units.has(target) &&
                        !this.registry.active(target)
                    )
                )
                    n.issue(order.unit, order);
            }
        } catch (error) {
            this.issuing = false;
            throw error;
        }
        this.issuing = false;
    }
}
