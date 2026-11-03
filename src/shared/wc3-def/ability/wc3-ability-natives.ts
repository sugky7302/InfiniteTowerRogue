import { AbilityNatives } from "./ability-natives";

export const wc3AbilityNatives: AbilityNatives = {
    cooldown: (target, ability) => BlzGetUnitAbilityCooldownRemaining(target, ability),
    startCooldown(target, ability, seconds) {
        if (seconds > 0) BlzStartUnitAbilityCooldown(target, ability, seconds);
        else BlzEndUnitAbilityCooldown(target, ability);
    },
    // 不隱藏圖示，只顯示為停用。
    disableAbility: (target, ability, disabled) =>
        BlzUnitDisableAbility(target, ability, disabled, false),
    abilityText(id, field, level, text) {
        switch (field) {
            case "tip":
                BlzSetAbilityTooltip(id, text, level);
                break;
            case "ubertip":
                BlzSetAbilityExtendedTooltip(id, text, level);
                break;
            case "untip":
                BlzSetAbilityActivatedTooltip(id, text, level);
                break;
            case "unubertip":
                BlzSetAbilityActivatedExtendedTooltip(id, text, level);
                break;
            case "researchtip":
                BlzSetAbilityResearchTooltip(id, text, level);
                break;
            case "researchubertip":
                BlzSetAbilityResearchExtendedTooltip(id, text, level);
                break;
        }
    },
};
