export type AbilityTextField =
    "tip" | "ubertip" | "untip" | "unubertip" | "researchtip" | "researchubertip";

export interface AbilityNatives {
    cooldown(target: unit, ability: number): number;
    /** 秒數大於 0 時開始冷卻；否則結束冷卻。 */
    startCooldown(target: unit, ability: number, seconds: number): void;
    /** WC3 停用是計數制。每次停用都要有一次對應的啟用。 */
    disableAbility(target: unit, ability: number, disabled: boolean): void;
    /** 文字只供顯示。 */
    abilityText(id: number, field: AbilityTextField, level: number, text: string): void;
}
