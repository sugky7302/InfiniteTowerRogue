import { UnitActionNatives, UnitNatives, EffectNatives, RandomNatives } from "@shared/lib/wc3-def";

export type CombatNatives = UnitActionNatives &
    Pick<UnitNatives, "x" | "y" | "stop" | "speed" | "setSpeed" | "unitType"> &
    Pick<EffectNatives, "text"> &
    RandomNatives;
