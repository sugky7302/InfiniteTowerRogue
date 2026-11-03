import { Clock, config, frames } from "../../src/shared/rxwc3";
import { fireball, frostbolt, castSeconds, yardsToWc3 } from "@features/skill";
import {
    checkValue,
    rollCheck,
    resolveDamage,
    Burning,
    MovementSlows,
    periodicTicks,
} from "@entities/combat";
import { installPauseBridge } from "@features/combat";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";
import { FakeFrames, FakeSkillNatives, makeUnit, unitState } from "./fakes";
import { setupSkill } from "./setup";

function check(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}
/** Node 與 Lua 使用相同流程。Lua 關閉 debug，以檢查遊戲限制。 */
export function verifySkill(): number {
    const errors: unknown[] = [],
        saved = config.onUnhandledError;
    config.onUnhandledError = (error) => {
        errors.push(error);
    };
    let groups = 0;
    try {
        const clock = new Clock(new FakeClockDriver()),
            native = new FakeFrames();
        const source = frames({ clock, natives: native });
        let count = 0,
            delta = 0;
        const a = source.subscribe((frame) => {
            count++;
            delta = frame.deltaSeconds;
        });
        const b = source.subscribe(() => {
            count++;
        });
        native.fire();
        check(native.starts === 1 && count === 2 && delta === 1 / 32, "幀來源共用或間隔錯誤。");
        clock.pause();
        native.fire(10);
        check(count === 2, "暫停仍送出幀。");
        clock.resume();
        native.fire();
        a.unsubscribe();
        b.unsubscribe();
        check(count === 4 && native.stops === 1, "幀恢復或取消錯誤。");
        groups++;
        check(
            castSeconds(fireball) === 1.5 &&
                castSeconds(frostbolt) === 1.75 &&
                yardsToWc3(20) === 640,
            "施法公式錯誤。",
        );
        groups++;
        const threshold = checkValue({
            challenge: 1,
            complexity: 3,
            adverse: 2,
            level: 1,
            attribute: 4,
            knowledge: 3,
            favorable: 0,
        });
        check(
            threshold === 7 && !rollCheck(7, () => 7).success && rollCheck(7, () => 8).success,
            "技能檢定錯誤。",
        );
        groups++;
        const damage = resolveDamage(10, 41, 0.8, { defense: 12, resistance: 0, shield: 0 });
        check(
            Math.abs(damage.raw - 42.8) < 0.00001 && Math.abs(damage.life - 38.2142857) < 0.0001,
            "傷害公式錯誤。",
        );
        groups++;
        const driver = new FakeClockDriver(),
            world = new Clock(driver);
        let ticks = 0;
        const burn = new Burning(world, () => {
            ticks++;
        });
        burn.refresh(1, 1, 3);
        driver.advance(1);
        burn.refresh(1, 1, 3);
        driver.advance(1);
        burn.clear();
        driver.advance(5);
        check(ticks === 2 && periodicTicks(100, 1, 1, 3)[2] === 3100, "燃燒刷新或解除錯誤。");
        groups++;
        let speed = 1;
        const slow = new MovementSlows(world, (value) => {
            speed = value;
        });
        slow.refresh("甲", "冰", 0.5, 8);
        slow.refresh("乙", "冰", 0.25, 1);
        check(speed === 0.25, "較強減速未生效。");
        driver.advance(1);
        check(speed === 0.5, "較弱減速未恢復。");
        slow.clear();
        check(speed === 1, "減速未清理。");
        groups++;
        const n = new FakeSkillNatives(),
            hero = makeUnit();
        unitState(hero).cooldowns.set(1, 2.5);
        const bridge = installPauseBridge(world, n, [hero], [1]);
        world.pause();

        check(
            n.mana(hero) === 69 &&
                n.cooldown(hero, 1) === 0 &&
                n.regen(hero) === 0 &&
                unitState(hero).disabled.get(1) === 1,
            "暫停未固定資源。",
        );
        world.resume();
        check(n.regen(hero) === 2 && n.cooldown(hero, 1) === 2.5, "暫停轉接未還原。");
        bridge.unsubscribe();
        groups++;
        const s = setupSkill();
        s.cast();
        s.driver.advance(1.75);
        s.timer.fire(16);
        check(
            s.natives.hits.length === 1 &&
                Math.abs(s.natives.hits[0].amount - 38.2142857) < 0.0001 &&
                unitState(s.target).speed === 135,
            "施法命中失敗。",
        );
        s.runtime.owner.unsubscribe();
        check(unitState(s.target).speed === 270, "停止未清理減速。");
        groups++;
        const failed = setupSkill();
        failed.natives.roll = 7;
        failed.cast();
        failed.driver.advance(2);
        failed.timer.fire(32);
        check(
            failed.natives.hits.length === 0 && failed.natives.visuals.length === 0,
            "失敗仍建立投射物。",
        );
        failed.runtime.owner.unsubscribe();
        groups++;
        const interrupted = setupSkill();
        interrupted.cast();
        interrupted.driver.advance(0.5);
        interrupted.eventNatives.emit("spellEndCast");
        interrupted.driver.advance(2);
        check(
            interrupted.natives.randomCalls === 0 && interrupted.natives.messages[0] === "中斷",
            "中斷仍檢定或未顯示文字。",
        );
        interrupted.runtime.owner.unsubscribe();
        groups++;
        const invalid = setupSkill();
        invalid.cast();
        invalid.driver.advance(1.75);
        unitState(invalid.target).alive = false;
        invalid.timer.fire();
        check(
            invalid.natives.hits.length === 0 && invalid.natives.visuals[0].destroyed,
            "失效投射物仍命中。",
        );
        invalid.runtime.owner.unsubscribe();
        groups++;
        const area = setupSkill();
        area.cast(fireball, 0, 0);
        area.driver.advance(1.5);
        area.timer.fire();
        area.driver.advance(3);
        check(
            area.natives.hits.length === 4 && area.natives.hits[0].target === area.caster,
            "區域未涵蓋施法者或週期錯誤。",
        );
        area.runtime.owner.unsubscribe();
        groups++;

        const ordered = setupSkill();
        ordered.cast();
        ordered.order(851986);
        ordered.driver.advance(2);
        check(
            ordered.natives.randomCalls === 0 && ordered.natives.messages[0] === "中斷",
            "命令未中斷施法。",
        );
        ordered.runtime.owner.unsubscribe();
        groups++;
        const completed = setupSkill();
        completed.cast();
        completed.driver.advance(1.75);
        check(
            completed.natives.stops.length === 1 &&
                completed.natives.randomCalls === 1 &&
                !completed.natives.messages.includes("中斷"),
            "完成停止被視為中斷。",
        );
        completed.runtime.owner.unsubscribe();
        groups++;
        const paused = setupSkill();
        const pauseBridge = installPauseBridge(
            paused.clock,
            paused.natives,
            [paused.caster],
            [1, 2],
        );
        paused.cast();
        paused.driver.advance(0.5);
        paused.clock.pause();
        paused.driver.advance(10);
        check(
            paused.natives.randomCalls === 0 && paused.natives.stops.length === 0,
            "暫停仍完成施法。",
        );
        paused.clock.resume();
        paused.driver.advance(1.25);
        check(
            paused.natives.randomCalls === 1 && paused.natives.stops.length === 1,
            "恢復後未完成施法。",
        );
        pauseBridge.unsubscribe();
        paused.runtime.owner.unsubscribe();
        groups++;
        const counted = makeUnit();
        n.disableAbility(counted, 1, true);
        const countedBridge = installPauseBridge(world, n, [counted, counted], [1, 1]);
        world.pause();
        n.disableAbility(counted, 1, true);
        check(unitState(counted).disabled.get(1) === 3, "重複輸入造成多次停用。");
        countedBridge.unsubscribe();
        world.resume();
        check(unitState(counted).disabled.get(1) === 2, "清理改變外部停用計數。");
        groups++;
        check(errors.length === 0, "技能流程發生未處理錯誤。");
    } catch (error) {
        throw error;
    } finally {
        config.onUnhandledError = saved;
    }
    return groups;
}
