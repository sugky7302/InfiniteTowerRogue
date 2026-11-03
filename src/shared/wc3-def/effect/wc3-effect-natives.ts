import { EffectNatives } from "./effect-natives";

export const wc3EffectNatives: EffectNatives = {
    text(target, message) {
        const tag = CreateTextTag()!;
        SetTextTagText(tag, message, 0.02);
        SetTextTagPosUnit(tag, target, 60);
        SetTextTagVelocity(tag, 0, 0.025);
        SetTextTagPermanent(tag, false);
        SetTextTagLifespan(tag, 3);
        SetTextTagFadepoint(tag, 2);
    },
    createEffect(model, x, y) {
        const visual = AddSpecialEffect(model, x, y)!;
        BlzSetSpecialEffectHeight(visual, 80);
        return visual;
    },
    moveEffect(target, x, y) {
        BlzSetSpecialEffectX(target, x);
        BlzSetSpecialEffectY(target, y);
        BlzSetSpecialEffectHeight(target, 80);
    },
    destroyEffect: (target) => DestroyEffect(target),
};
