import { Clock, ClockDriver, Subject } from "@shared/lib/rxwc3";
import { DamagingEvent, UnitOrderEvent } from "@shared/lib/wc3-def";
import { scholar, patrolMachine } from "@entities/character";
import { updateCombatLife, settleDamage } from "@entities/combat";
import { CombatStats } from "@entities/combat";
import { fireball } from "@features/skill";
import { setupSkill } from "../skill/setup";
import {
    CombatRegistry,
    CombatNatives,
    CombatRuntime,
    TacticalPause,
    PatrolMachine,
    ordinaryAttack,
} from "@features/combat";

function check(value: boolean): void {
    if (!value) throw new Error("C4 案例結果錯誤。");
}
class TestDriver implements ClockDriver {
    public ms = 0;
    private started = 0;
    private due: number | undefined;
    private callback: ((this: void) => void) | undefined;
    public start(): void {
        this.started = this.ms;
    }
    public stop(): void {
        this.cancelWake();
    }
    public elapsedTicks(): number {
        return this.ms - this.started;
    }
    public wakeAfter(seconds: number, callback: (this: void) => void): void {
        this.due = this.ms + Math.round(seconds * 1000);
        this.callback = callback;
    }
    public cancelWake(): void {
        this.due = undefined;
        this.callback = undefined;
    }
    public advance(ms: number): void {
        const end = this.ms + ms;
        while (this.due !== undefined && this.due <= end) {
            this.ms = this.due;
            const callback = this.callback!;
            this.due = undefined;
            callback();
        }
        this.ms = end;
    }
}
interface NativeUnit {
    x: number;
    y: number;
    speed: number;
    scale: number;
    weapons: boolean[];
    maximum: number;
    displayed: number;
    regen: number;
    paused: boolean;
    invulnerable: boolean;
    flags: number;
    removed: boolean;
    animation: string;
}
export function combatFixture() {
    const driver = new TestDriver(),
        clock = new Clock(driver);
    const nativeUnits = new Map<unit, NativeUnit>();
    const messages: string[] = [],
        operations: string[] = [];
    const replayed: UnitOrderEvent[] = [];
    const orders = new Subject<UnitOrderEvent>(),
        damages = new Subject<DamagingEvent>();
    let d20 = 20,
        failWeapon = false;
    const read = (target: unit): NativeUnit => nativeUnits.get(target)!;
    const natives: CombatNatives = {
        x: (target) => read(target).x,
        y: (target) => read(target).y,
        stop(target) {
            operations.push("停止");
            orders.next({
                unit: target,
                orderId: 851972,
                kind: "immediate",
                target: undefined,
                targetX: 0,
                targetY: 0,
            });
        },
        speed: (target) => read(target).speed,
        setSpeed(target, value) {
            read(target).speed = value;
        },
        unitType: (target) => (read(target).removed ? 0 : 1),
        timeScale(target, value) {
            read(target).scale = value;
        },
        weaponEnabled: (target, index) => read(target).weapons[index],
        setWeaponEnabled(target, index, value) {
            if (failWeapon) {
                failWeapon = false;
                throw new Error("測試武器寫入失敗。");
            }
            read(target).weapons[index] = value;
        },
        attackRange: () => 100,
        collision: () => 16,
        displayLife(target, maximum, current) {
            read(target).maximum = maximum;
            read(target).displayed = Math.max(1, current);
        },
        life: (target) => read(target).displayed,
        disableLifeRegen(target) {
            read(target).regen = 0;
        },
        pauseUnit(target, value) {
            read(target).paused = value;
        },
        invulnerable: (target) => read(target).invulnerable,
        setInvulnerable(target, value) {
            read(target).invulnerable = value;
        },
        targetFlags: (target) => read(target).flags,
        setTargetFlags(target, value) {
            read(target).flags = value;
        },
        animation(target, value) {
            read(target).animation = value;
        },
        remove(target) {
            read(target).removed = true;
        },
        move() {
            operations.push("移動");
        },
        face() {
            operations.push("轉向");
        },
        issue(_target, order) {
            replayed.push(order);
            orders.next(order);
        },
        text(_target, text) {
            messages.push(text);
        },
        randomInt(_low, high) {
            operations.push(high === 20 ? "D20" : "暴擊");
            return high === 20 ? d20 : 10000;
        },
    };
    const registry = new CombatRegistry(natives, clock);
    const create = (role: "player" | "enemy", target = {} as unit): unit => {
        nativeUnits.set(target, {
            x: role === "player" ? 100 : 0,
            y: 0,
            speed: 270,
            scale: 1,
            weapons: [role === "player", false],
            maximum: 0,
            displayed: 0,
            regen: 1,
            paused: false,
            invulnerable: false,
            flags: 3,
            removed: false,
            animation: "stand",
        });
        registry.register(target, role, role, role === "player" ? scholar : patrolMachine);
        return target;
    };
    const hero = create("player"),
        enemy = create("enemy");
    const order = (target: unit, kind: UnitOrderEvent["kind"], id: number): UnitOrderEvent => ({
        unit: target,
        orderId: id,
        kind,
        target: kind === "target" ? enemy : undefined,
        targetX: 200,
        targetY: 300,
    });
    return {
        driver,
        clock,
        registry,
        natives,
        read,
        hero,
        enemy,
        create,
        orders,
        damages,
        order,
        messages,
        operations,
        replayed,
        roll(value: number) {
            d20 = value;
        },
        failWeapon() {
            failWeapon = true;
        },
    };
}
function machine(): PatrolMachine {
    return new PatrolMachine(
        {
            prepareMs: 800,
            recoveryMs: 600,
            length: 160,
            width: 80,
            noticeRange: 600,
            chaseRange: 900,
        },
        [
            { x: 0, y: 0 },
            { x: -300, y: 0 },
        ],
    );
}
const reach = () => ({
    distance: 100,
    attackRange: 100,
    attackerCollision: 16,
    targetCollision: 16,
    tolerance: 32,
});

function damaging(
    f: ReturnType<typeof combatFixture>,
    isAttack: boolean,
    onSet: (this: void, value: number) => void,
): DamagingEvent {
    return {
        source: f.hero,
        target: f.enemy,
        isAttack,
        amount: 8,
        attackType: {} as attacktype,
        damageType: {} as damagetype,
        weaponType: {} as weapontype,
        setAmount(value) {
            onSet(value);
        },
        setAttackType() {},
        setDamageType() {},
        setWeaponType() {},
    };
}

export const integrationCases: { name: string; run: (this: void) => void }[] = [
    {
        name: "生命防護：非攻擊原生傷害歸零，且不擲 D20",
        run() {
            const f = combatFixture();
            const runtime = new CombatRuntime(
                f.registry,
                f.clock,
                { onDamaging: f.damages, onUnitOrder: f.orders },
                { warning() {}, clear() {} },
            );
            let amount = 8;
            f.damages.next(damaging(f, false, (value) => (amount = value)));
            check(amount === 0 && !f.operations.includes("D20"));
            check(f.registry.target(f.enemy).life === f.registry.require(f.enemy).life.maxLife);
            runtime.owner.unsubscribe();
        },
    },
    {
        name: "生命防護：登錄關閉原生恢復，步進修正被改寫的原生生命",
        run() {
            const f = combatFixture();
            check(f.read(f.hero).regen === 0 && f.read(f.enemy).regen === 0);
            const runtime = new CombatRuntime(
                f.registry,
                f.clock,
                { onDamaging: f.damages, onUnitOrder: f.orders },
                { warning() {}, clear() {} },
            );
            const life = f.registry.require(f.hero).life.life;
            f.read(f.hero).displayed = 0.2;
            f.read(f.enemy).displayed = 9999;
            f.driver.advance(50);
            check(f.read(f.hero).displayed === Math.max(1, life));
            check(f.read(f.enemy).displayed === f.registry.require(f.enemy).life.life);
            runtime.owner.unsubscribe();
        },
    },
    {
        name: "C4 登錄保存實際生命、陣營與血條",
        run() {
            const f = combatFixture();
            check(f.registry.target(f.hero).life === 42 && f.registry.target(f.enemy).life === 62);
            check(f.read(f.hero).maximum === 42 && f.read(f.enemy).maximum === 62);
            check(f.registry.require(f.hero).faction !== f.registry.require(f.enemy).faction);
        },
    },
    {
        name: "C4 D20 失敗先於距離與傷害",
        run() {
            const f = combatFixture();
            f.roll(1);
            let reached = false;
            check(
                ordinaryAttack(f.registry, f.hero, f.enemy, () => {
                    reached = true;
                    return reach();
                }) === "miss",
            );
            check(!reached && f.registry.target(f.enemy).life === 62);
            check(
                f.messages.some((text) => text.includes("骰值 1")) && f.messages.includes("未命中"),
            );
        },
    },
    {
        name: "C4 D20 成功後檢查距離備援",
        run() {
            const f = combatFixture();
            check(
                ordinaryAttack(f.registry, f.hero, f.enemy, () => ({
                    ...reach(),
                    distance: 165,
                })) === "dodge",
            );
            check(f.registry.target(f.enemy).life === 62 && f.messages.includes("閃避"));
            check(f.operations[0] === "D20");
        },
    },
    {
        name: "C4 距離邊界命中並以武器結算護盾",
        run() {
            const f = combatFixture();
            f.registry.require(f.enemy).life = updateCombatLife(
                f.registry.require(f.enemy).life,
                62,
                2,
            );
            check(
                ordinaryAttack(f.registry, f.hero, f.enemy, () => ({
                    ...reach(),
                    distance: 164,
                })) === "hit",
            );
            const state = f.registry.target(f.enemy);
            check(
                state.shields![0].capacity === 0 &&
                    Math.abs(state.life - (64 - (8 * 100) / 122)) < 0.001,
            );
            check(f.read(f.enemy).displayed === state.life);
        },
    },
    {
        name: "C4 同陣營與失能者不能攻擊",
        run() {
            const f = combatFixture(),
                ally = f.create("player");
            check(ordinaryAttack(f.registry, f.hero, ally, reach) === "invalid");
            f.registry.setLife(f.hero, 0, 0);
            check(ordinaryAttack(f.registry, f.hero, f.enemy, reach) === "invalid");
            check(f.operations.filter((value) => value === "D20").length === 0);
        },
    },
    {
        name: "C4 玩家失能阻止命令並由復起還原",
        run() {
            const f = combatFixture(),
                pause = new TacticalPause(f.registry, f.clock);
            const subscription = f.orders.subscribe((event) => pause.order(event));
            f.registry.setLife(f.hero, 0, 0);
            const state = f.read(f.hero);
            check(state.paused && state.invulnerable && state.flags === 0 && state.displayed === 1);
            f.orders.next(f.order(f.hero, "point", 851986));
            check(f.replayed.length === 0);
            f.registry.setLife(f.hero, 20, 0);
            check(f.registry.target(f.hero).life === 0);
            f.registry.revive(f.hero);
            check(
                f.registry.target(f.hero).life === 42 &&
                    !state.paused &&
                    !state.invulnerable &&
                    state.flags === 3,
            );
            subscription.unsubscribe();
            pause.owner.unsubscribe();
        },
    },
    {
        name: "C4 敵人擊倒只排程一次，世界暫停延後移除",
        run() {
            const f = combatFixture();
            f.registry.setLife(f.enemy, 0, 0);
            f.registry.setLife(f.enemy, 0, 0);
            check(f.read(f.enemy).animation === "death" && !f.read(f.enemy).weapons[0]);
            check(f.clock.pendingCount() === 1);
            f.driver.advance(1000);
            f.clock.pause();
            f.driver.advance(5000);
            check(!f.read(f.enemy).removed);
            f.clock.resume();
            f.driver.advance(1000);
            check(f.read(f.enemy).removed && !f.registry.units.has(f.enemy));
        },
    },
    {
        name: "C4 暫停保存兩個武器、移速與自有動作速度",
        run() {
            const f = combatFixture(),
                pause = new TacticalPause(f.registry, f.clock);
            pause.setTimeScale(f.hero, 0.75);
            f.read(f.hero).speed = 180;
            f.read(f.enemy).weapons = [false, true];
            f.clock.pause();
            f.clock.pause();
            check(f.read(f.hero).scale === 0 && f.read(f.hero).speed === 0);
            check(!f.read(f.enemy).weapons[1] && !f.read(f.hero).paused);
            f.clock.resume();
            check(f.read(f.hero).scale === 0);
            f.clock.resume();
            check(f.read(f.hero).scale === 0.75 && f.read(f.hero).speed === 180);
            check(
                f.read(f.hero).weapons[0] &&
                    !f.read(f.hero).weapons[1] &&
                    f.read(f.enemy).weapons[1],
            );
            pause.owner.unsubscribe();
        },
    },
    {
        name: "C4 暫停中的減速與動作速度設定在恢復時套用",
        run() {
            const f = combatFixture(),
                pause = new TacticalPause(f.registry, f.clock);
            f.clock.pause();
            pause.setSpeed(f.hero, 135);
            pause.setTimeScale(f.hero, 0.5);
            check(
                f.read(f.hero).speed === 0 &&
                    f.read(f.hero).scale === 0 &&
                    pause.speed(f.hero) === 135,
            );
            f.clock.resume();
            check(f.read(f.hero).speed === 135 && f.read(f.hero).scale === 0.5);
        },
    },
    {
        name: "C4 暫停中新增登錄單位立即停止",
        run() {
            const f = combatFixture();
            new TacticalPause(f.registry, f.clock);
            f.clock.pause();
            const target = f.create("player");
            check(
                f.read(target).scale === 0 &&
                    f.read(target).speed === 0 &&
                    !f.read(target).weapons[0],
            );
            f.clock.resume();
            check(f.read(target).speed === 270 && f.read(target).weapons[0]);
        },
    },
    {
        name: "C4 暫停只重播玩家最後一個命令",
        run() {
            const f = combatFixture(),
                pause = new TacticalPause(f.registry, f.clock);
            f.orders.subscribe((event) => pause.order(event));
            f.clock.pause();
            f.orders.next(f.order(f.hero, "immediate", 851993));
            f.orders.next(f.order(f.hero, "target", 851983));
            f.orders.next(f.order(f.hero, "point", 851986));
            f.orders.next(f.order(f.enemy, "point", 851986));
            f.clock.resume();
            f.driver.advance(0);
            check(
                f.replayed.length === 1 &&
                    f.replayed[0].kind === "point" &&
                    f.replayed[0].targetX === 200,
            );
        },
    },
    {
        name: "C4 暫停中失能不重播命令，擊倒不恢復武器",
        run() {
            const f = combatFixture(),
                pause = new TacticalPause(f.registry, f.clock);
            f.orders.subscribe((event) => pause.order(event));
            f.clock.pause();
            f.orders.next(f.order(f.hero, "point", 851986));
            f.registry.setLife(f.hero, 0, 0);
            f.registry.setLife(f.enemy, 0, 0);
            f.clock.resume();
            f.driver.advance(0);
            check(
                f.replayed.length === 0 &&
                    f.read(f.hero).paused &&
                    !f.read(f.enemy).weapons[0] &&
                    f.read(f.enemy).speed === 0,
            );
        },
    },
    {
        name: "C4 巡邏察覺追擊與超距離返回",
        run() {
            const m = machine();
            check(m.step(50, { x: 0, y: 0 })?.kind === "move" && m.state === "patrol");
            m.step(50, { x: 0, y: 0 }, { x: 600, y: 0 });
            check(m.state === "chase");
            m.step(50, { x: 0, y: 0 }, { x: 901, y: 0 });
            check(m.state === "patrol");
        },
    },
    {
        name: "C4 準備 800 毫秒固定方向，收招 600 毫秒",
        run() {
            const m = machine(),
                origin = { x: 0, y: 0 };
            check(m.step(50, origin, { x: 100, y: 0 })?.kind === "prepare");
            for (let index = 0; index < 15; index++)
                check(m.step(50, origin, { x: 0, y: 100 }) === undefined);
            check(m.direction === 0 && m.remainingMs === 50);
            check(m.step(50, origin, { x: 0, y: 100 })?.kind === "act");
            m.recover();
            for (let index = 0; index < 11; index++) check(m.step(50, origin) === undefined);
            check(m.remainingMs === 50);
            m.step(50, origin);
            check(m.state === "patrol");
        },
    },
    {
        name: "C4 直線形狀長 160、寬 80，離開側面可以閃避",
        run() {
            const m = machine();
            m.step(50, { x: 0, y: 0 }, { x: 100, y: 0 });
            check(m.contains({ x: 160, y: 40 }) && m.contains({ x: 0, y: -40 }));
            check(
                !m.contains({ x: 160.01, y: 0 }) &&
                    !m.contains({ x: 100, y: 40.01 }) &&
                    !m.contains({ x: -1, y: 0 }),
            );
        },
    },
    {
        name: "C4 傷害前事件先歸零，再執行檢定",
        run() {
            const f = combatFixture();
            const runtime = new CombatRuntime(
                f.registry,
                f.clock,
                { onDamaging: f.damages, onUnitOrder: f.orders },
                { warning() {}, clear() {} },
            );
            let amount = 8;
            f.damages.next({
                source: f.hero,
                target: f.enemy,
                isAttack: true,
                amount,
                attackType: {} as attacktype,
                damageType: {} as damagetype,
                weaponType: {} as weapontype,
                setAmount(value) {
                    amount = value;
                    f.operations.push("歸零");
                },
                setAttackType() {},
                setDamageType() {},
                setWeaponType() {},
            });
            check(
                amount === 0 &&
                    f.operations[0] === "歸零" &&
                    f.operations[1] === "D20" &&
                    f.registry.target(f.enemy).life < 62,
            );
            runtime.owner.unsubscribe();
        },
    },
    {
        name: "C4 世界時鐘停止預告計時，恢復後作用一次",
        run() {
            const f = combatFixture();
            let warnings = 0;
            const runtime = new CombatRuntime(
                f.registry,
                f.clock,
                { onDamaging: f.damages, onUnitOrder: f.orders },
                {
                    warning() {
                        warnings++;
                    },
                    clear() {},
                },
            );
            const m = machine();
            runtime.trackMachine(f.enemy, m);
            f.driver.advance(50);
            check(warnings === 1 && m.remainingMs === 800);
            f.driver.advance(400);
            f.clock.pause();
            f.driver.advance(10000);
            check(m.remainingMs === 400 && f.registry.target(f.hero).life === 42);
            f.clock.resume();
            f.driver.advance(400);
            check(
                f.registry.target(f.hero).life < 42 &&
                    m.state === "recovery" &&
                    m.remainingMs === 600,
            );
            runtime.owner.unsubscribe();
        },
    },
    {
        name: "C4 預告後走出形狀，檢定成功也沒有傷害",
        run() {
            const f = combatFixture();
            const runtime = new CombatRuntime(
                f.registry,
                f.clock,
                { onDamaging: f.damages, onUnitOrder: f.orders },
                { warning() {}, clear() {} },
            );
            runtime.trackMachine(f.enemy, machine());
            f.driver.advance(50);
            f.read(f.hero).y = 41;
            f.driver.advance(800);
            check(f.registry.target(f.hero).life === 42 && f.operations.includes("D20"));
            runtime.owner.unsubscribe();
        },
    },
    {
        name: "C4 巡檢機檢定失敗不產生傷害",
        run() {
            const f = combatFixture();
            f.roll(1);
            const runtime = new CombatRuntime(
                f.registry,
                f.clock,
                { onDamaging: f.damages, onUnitOrder: f.orders },
                { warning() {}, clear() {} },
            );
            runtime.trackMachine(f.enemy, machine());
            f.driver.advance(850);
            check(f.registry.target(f.hero).life === 42 && f.messages.includes("未命中"));
            runtime.owner.unsubscribe();
        },
    },
    {
        name: "C4 技能結算提交實際生命與護盾並觸發擊倒",
        run() {
            const f = combatFixture();
            f.registry.require(f.enemy).life = updateCombatLife(
                f.registry.require(f.enemy).life,
                5,
                2,
            );
            const result = settleDamage({
                event: {
                    source: f.hero,
                    target: f.enemy,
                    kind: "direct",
                    output: "spell",
                    canCrit: false,
                    parts: [{ amount: 20, tags: ["fire"], channel: "spell", history: "base" }],
                },
                target: f.registry.target(f.enemy),
            });
            f.registry.commit(f.hero, f.enemy, result);
            check(
                f.registry.require(f.enemy).life.knockedDown &&
                    f.registry.require(f.enemy).life.shield === 0 &&
                    f.read(f.enemy).animation === "death",
            );
        },
    },
];

integrationCases.push({
    name: "C4 內部停止不覆蓋技能命令，資源還原後才重播",
    run() {
        const f = combatFixture(),
            pause = new TacticalPause(f.registry, f.clock);
        f.orders.subscribe((event) => pause.order(event));
        let resourcesReady = true;
        f.clock.pauseChanges.subscribe((paused) => {
            resourcesReady = !paused;
        });
        const issue = f.natives.issue;
        f.natives.issue = (target, order) => {
            check(resourcesReady);
            issue.call(f.natives, target, order);
        };
        f.clock.pause();
        f.orders.next(f.order(f.hero, "point", 852488));
        pause.stop(f.hero);
        f.clock.resume();
        check(f.replayed.length === 0);
        f.driver.advance(0);
        check(f.replayed.length === 1 && f.replayed[0].orderId === 852488);
    },
});

for (const skillKind of ["direct", "burn"] as const) {
    const kind = skillKind;
    integrationCases.push({
        name: `C4 技能完整流程提交登錄並由 ${kind === "direct" ? "寒冰箭" : "燃燒"} 擊倒`,
        run() {
            const f = combatFixture(),
                setup = setupSkill();
            f.create("player", setup.caster);
            f.create("enemy", setup.target);
            const stats: CombatStats = setup.natives;
            stats.damageTarget = (target) => f.registry.target(target);
            stats.damageAttacker = (source) => f.registry.attacker(source);
            stats.commitDamage = (source, target, result) =>
                f.registry.commit(source, target, result);
            setup.natives.alive = (target) => f.registry.active(target);
            const life = kind === "direct" ? 5 : 12;
            f.registry.require(setup.target).life = updateCombatLife(
                f.registry.require(setup.target).life,
                life,
                2,
            );
            try {
                setup.cast(kind === "burn" ? fireball : undefined);
                setup.driver.advance(kind === "burn" ? 1.5 : 1.75);
                setup.timer.fire(16);
                check(setup.natives.hits.length === 0);
                if (kind === "burn") {
                    check(f.registry.active(setup.target));
                    setup.driver.advance(3);
                }
                check(
                    f.registry.require(setup.target).life.knockedDown &&
                        f.read(setup.target).animation === "death",
                );
                check(f.registry.require(setup.target).life.shield === 0);
            } catch (error) {
                setup.runtime.owner.unsubscribe();
                throw error;
            }
            setup.runtime.owner.unsubscribe();
        },
    });
}

export function verifyCombatIntegration(): number {
    for (const item of integrationCases) {
        try {
            item.run();
        } catch (error) {
            throw new Error(`${item.name}。${(error as { message: string }).message}`);
        }
    }
    return integrationCases.length;
}
