import { Clock, createWc3Events, frames } from "../../src/shared/lib/rxwc3";
import { SkillRuntime, fireball, frostbolt, SkillDefinition, SKILLS } from "@features/skill";
import { FakeClockDriver } from "../rxwc3/fake-clock-driver";
import { FakeEventNatives, spell } from "../rxwc3/fake-event-natives";
import { abilityCode, FakeFrames, FakeSkillNatives, makeUnit } from "./fakes";

export function setupSkill() {
    const driver = new FakeClockDriver(),
        clock = new Clock(driver),
        timer = new FakeFrames();
    const natives = new FakeSkillNatives(),
        eventNatives = new FakeEventNatives(),
        events = createWc3Events(eventNatives);
    const caster = makeUnit(),
        target = makeUnit(320, 0);
    const runtime = new SkillRuntime(natives, natives, clock, frames({ clock, natives: timer }));
    runtime.track(caster, SKILLS, events, abilityCode);
    natives.targets = [caster, target];
    const order = (orderId = 851972): void => {
        eventNatives.currentOrder = {
            unit: caster,
            orderId,
            kind: "immediate",
            target: undefined,
            targetX: 0,
            targetY: 0,
        };
        eventNatives.emit("order");
    };
    natives.onStop = () => {
        order();
        eventNatives.emit("spellEndCast");
    };
    const cast = (skill: SkillDefinition = frostbolt, x = 320, y = 0): void => {
        order(skill === fireball ? 852488 : 852226);
        eventNatives.currentSpell = {
            ...spell(caster),
            abilityId: abilityCode(skill.code),
            target: skill === fireball ? undefined : target,
            targetX: x,
            targetY: y,
        };
        eventNatives.emit("spellChannel");
    };
    return {
        driver,
        clock,
        timer,
        natives,
        eventNatives,
        events,
        caster,
        target,
        runtime,
        cast,
        order,
    };
}
