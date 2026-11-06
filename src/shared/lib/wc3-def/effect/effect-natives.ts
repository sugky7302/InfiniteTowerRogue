export interface EffectNatives {
    /** 在單位上方顯示短暫的浮動文字。 */
    text(target: unit, message: string): void;
    createEffect(model: string, x: number, y: number): effect;
    moveEffect(target: effect, x: number, y: number): void;
    destroyEffect(target: effect): void;
}
