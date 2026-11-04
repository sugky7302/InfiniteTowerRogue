import { Clock, Phase, Subscription, Observable } from "@shared/rxwc3";
import { DamagingEvent, UnitOrderEvent } from "@shared/wc3-def";
import { CombatRegistry } from "./registry";
import { attackCheck, ordinaryAttack, weaponDamage } from "./attack";
import { PatrolMachine } from "./patrol-machine";
import { TacticalPause } from "./tactical-pause";

export interface CombatPresentation {
    warning(target: unit, machine: PatrolMachine): void;
    clear(target: unit): void;
}
export class CombatRuntime {
    public readonly owner = new Subscription();
    public readonly pause: TacticalPause;
    private readonly machines = new Map<unit, PatrolMachine>();
    private readonly moves = new Map<unit, { x: number; y: number }>();
    /** 除錯用。為 true 時巡檢機停在原地，不移動也不攻擊。 */
    public held = false;
    public constructor(
        public readonly registry: CombatRegistry,
        private readonly clock: Clock,
        events: { onDamaging: Observable<DamagingEvent>; onUnitOrder: Observable<UnitOrderEvent> },
        private readonly presentation: CombatPresentation,
    ) {
        this.pause = new TacticalPause(registry, clock);
        this.owner.add(this.pause.owner);
        this.owner.add(registry.owner);
        this.owner.add(events.onUnitOrder.subscribe((event) => this.pause.order(event)));
        this.owner.add(
            events.onDamaging.subscribe((event) => {
                if (!registry.units.has(event.target)) return;
                // 已登錄目標的生命只由本系統結算。全部原生傷害都清除。
                event.setAmount(0);
                if (!event.isAttack) return;
                const source = event.source,
                    target = event.target;
                if (
                    clock.isPaused() ||
                    source === undefined ||
                    !registry.active(source) ||
                    registry.require(source).life.role !== "player"
                )
                    return;
                ordinaryAttack(registry, source, target, () => {
                    const n = registry.natives;
                    const dx = n.x(source) - n.x(target),
                        dy = n.y(source) - n.y(target);
                    return {
                        distance: Math.sqrt(dx * dx + dy * dy),
                        attackRange: n.attackRange(source),
                        attackerCollision: n.collision(source),
                        targetCollision: n.collision(target),
                        tolerance: 32,
                    };
                });
            }),
        );
        this.owner.add(() => {
            for (const target of this.machines.keys()) presentation.clear(target);
            this.machines.clear();
            this.moves.clear();
        });
        this.schedule();
    }
    public trackMachine(target: unit, machine: PatrolMachine): void {
        this.machines.set(target, machine);
        this.registry.natives.setWeaponEnabled(target, 0, false);
        this.registry.natives.setWeaponEnabled(target, 1, false);
    }
    /** 除錯用。切換巡檢機是否停在原地。停住時清除預告並回到巡邏。 */
    public hold(held: boolean): void {
        this.held = held;
        if (!held) return;
        for (const [target, machine] of this.machines) {
            this.presentation.clear(target);
            machine.state = "patrol";
            this.moves.delete(target);
            this.registry.natives.stop(target);
        }
    }
    public moveMachine(target: unit, x: number, y: number): void {
        if (!this.registry.active(target) || this.clock.isPaused()) return;
        this.presentation.clear(target);
        this.machines.get(target)!.state = "patrol";
        this.moves.set(target, { x, y });
    }
    private schedule(): void {
        if (this.owner.closed) return;
        const task = this.clock.schedule(
            0.05,
            () => {
                this.owner.remove(task);
                // 先安排下一步。單次錯誤由時鐘交給 logger.error，後續步進仍可執行。
                this.schedule();
                this.step();
            },
            Phase.Combat,
        );
        this.owner.add(task);
    }
    private step(): void {
        const registry = this.registry,
            n = registry.natives;
        registry.syncLife();
        for (const [target, machine] of this.machines) {
            if (!registry.active(target)) {
                this.presentation.clear(target);
                this.machines.delete(target);
                this.moves.delete(target);
                continue;
            }
            if (this.held) continue;
            const position = { x: n.x(target), y: n.y(target) };
            const move = this.moves.get(target);
            if (move !== undefined) {
                const dx = move.x - position.x,
                    dy = move.y - position.y;
                if (dx * dx + dy * dy > 32 * 32) {
                    n.move(target, move.x, move.y);
                    continue;
                }
                this.moves.delete(target);
            }
            let player: unit | undefined;
            let nearest = 2147483520;
            for (const state of registry.units.values()) {
                if (
                    state.life.role !== "player" ||
                    !registry.active(state.unit) ||
                    state.faction === registry.require(target).faction
                )
                    continue;
                const dx = n.x(state.unit) - position.x,
                    dy = n.y(state.unit) - position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < nearest) {
                    player = state.unit;
                    nearest = distance;
                }
            }
            const action = machine.step(
                50,
                position,
                player === undefined ? undefined : { x: n.x(player), y: n.y(player) },
            );
            if (action?.kind === "move") n.move(target, action.point.x, action.point.y);
            if (action?.kind === "prepare") {
                n.stop(target);
                n.face(target, machine.direction);
                this.presentation.warning(target, machine);
            }
            if (action?.kind === "act") {
                this.presentation.clear(target);
                // 每次作用只擲一次 D20。碰撞後不追加檢定。
                if (player !== undefined && attackCheck(registry, target, player)) {
                    for (const state of registry.units.values())
                        if (
                            state.life.role === "player" &&
                            registry.active(state.unit) &&
                            state.faction !== registry.require(target).faction &&
                            machine.contains({ x: n.x(state.unit), y: n.y(state.unit) })
                        )
                            weaponDamage(registry, target, state.unit);
                }
                machine.recover();
            }
        }
    }
}
