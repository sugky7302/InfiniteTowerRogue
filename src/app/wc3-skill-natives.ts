import { scholar, testEnemy } from "@entities/character";
import { attributeModifier, CombatStats, Defense, spellDefense } from "@entities/combat";
import { SkillNatives } from "@features/skill";
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
export function createWc3SkillNatives() {
    const damage = createWc3UnitDamage();
    const area = createWc3UnitArea();
    const u = wc3UnitNatives,
        a = wc3AbilityNatives,
        e = wc3EffectNatives;
    const natives: SkillNatives = {
        stop: u.stop,
        x: u.x,
        y: u.y,
        alive: u.alive,
        enemyVisible: u.enemyVisible,
        speed: u.speed,
        setSpeed: u.setSpeed,
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
        defense(target): Defense {
            return {
                defense: heroes.has(target)
                    ? spellDefense(scholar.spirit, scholar.constitution)
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
