import { runeScholar, combatLevel, testEnemy } from "@entities/character";
import {
    DamageStat,
    attributeModifier,
    CombatStats,
    Defense,
    spellDefense,
    deriveCombatStats,
} from "@entities/combat";
import { SkillNatives } from "@features/skill";
import { CombatRegistry, TacticalPause } from "@features/combat";
import {
    createWc3UnitArea,
    createWc3UnitDamage,
    wc3AbilityNatives,
    wc3EffectNatives,
    wc3RandomNatives,
    wc3UnitNatives,
} from "@shared/wc3-def";

/**
 * 組合技能範例需要的 WC3 原生操作與範例戰鬥數值。
 * 在共同流程呼叫一次：建立傷害觸發器與列舉群組。模組載入不建立 handle。
 */
export function createWc3SkillNatives(registry?: CombatRegistry, pause?: TacticalPause) {
    const damage = createWc3UnitDamage();
    const area = createWc3UnitArea();
    const u = wc3UnitNatives,
        a = wc3AbilityNatives,
        e = wc3EffectNatives;
    const natives: SkillNatives = {
        stop: (target) => {
            if (pause === undefined) u.stop(target);
            else pause.stop(target);
        },
        x: u.x,
        y: u.y,
        alive: (target) => (registry === undefined ? u.alive(target) : registry.active(target)),
        enemyVisible: (observer, target) =>
            u.enemyVisible(observer, target) && (registry === undefined || registry.active(target)),
        speed: (target) => (pause === undefined ? u.speed(target) : pause.speed(target)),
        setSpeed: (target, value) => {
            if (pause === undefined) u.setSpeed(target, value);
            else pause.setSpeed(target, value);
        },
        mana: u.mana,
        setMana: u.setMana,
        regen: u.regen,
        setRegen: u.setRegen,
        damage: damage.natives.damage,
        area: area.natives.area,
        cooldown: a.cooldown,
        startCooldown: a.startCooldown,
        disableAbility: a.disableAbility,
        text: e.text,
        createEffect: e.createEffect,
        moveEffect: e.moveEffect,
        destroyEffect: e.destroyEffect,
        randomInt: wc3RandomNatives.randomInt,
    };
    // 範例的戰鬥數值：英雄使用符文學者，敵人使用測試敵人。其他單位沒有法防。
    const shields = new Map<unit, number>();
    const heroes = new Set<unit>();
    const enemies = new Set<unit>();
    const stats: CombatStats = {
        caster: () => ({
            level: combatLevel(runeScholar),
            intelligence: runeScholar.attributes.intelligence,
            spellPower: deriveCombatStats({
                ...runeScholar.attributes,
                level: combatLevel(runeScholar),
            }).spellPower,
        }),
        damageTarget(target) {
            const defense = stats.defense(target);
            return {
                life: GetWidgetLife(target),
                maxLife: BlzGetUnitMaxHP(target),
                spellDefense: defense.defense,
                shields: [{ id: "skill-shield", capacity: defense.shield }],
                modifiers: [
                    {
                        id: "skill-resistance",
                        stat: DamageStat.Resistance,
                        value: defense.resistance,
                    },
                ],
            };
        },
        defense(target): Defense {
            return {
                defense: heroes.has(target)
                    ? spellDefense(
                          runeScholar.attributes.spirit,
                          runeScholar.attributes.constitution,
                      )
                    : enemies.has(target)
                      ? spellDefense(testEnemy.spirit, testEnemy.constitution)
                      : 0,
                resistance: testEnemy.resistance,
                shield: shields.get(target) ?? 0,
            };
        },
        setShield: (target, value) => {
            shields.set(target, value);
        },
        challenge: () => testEnemy.challenge,
        evasion: (target) => (enemies.has(target) ? attributeModifier(testEnemy.agility) : 0),
        combustible: (target) =>
            heroes.has(target) || (enemies.has(target) && testEnemy.combustible),
    };
    if (registry !== undefined) {
        stats.caster = (source) => registry.caster(source);
        stats.damageTarget = (target) => registry.target(target);
        stats.damageAttacker = (source) => registry.attacker(source);
        stats.commitDamage = (source, target, result) => registry.commit(source, target, result);
        stats.defense = (target) => ({
            defense: registry.require(target).stats.spellDefense,
            resistance: 0,
            shield: registry.require(target).life.shield,
        });
        stats.setShield = (target, value) => {
            const state = registry.require(target);
            registry.setLife(target, state.life.life, value);
        };
        stats.challenge = (target) => registry.require(target).profile.challenge;
        stats.evasion = (target) => registry.require(target).stats.evasion;
        stats.combustible = (target) => registry.active(target);
    }
    return {
        natives,
        stats,
        heroes,
        enemies,
        destroy(): void {
            damage.destroy();
            area.destroy();
            shields.clear();
            heroes.clear();
            enemies.clear();
        },
    };
}
