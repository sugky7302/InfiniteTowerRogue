import { ClassId } from "./classes";
import { scholar } from "../model/roles";
import { HeroState } from "../model/hero";

export const runeScholar: HeroState = {
    attributes: {
        strength: scholar.strength,
        precision: scholar.precision,
        agility: scholar.agility,
        constitution: scholar.constitution,
        spirit: scholar.spirit,
        intelligence: scholar.intelligence,
        luck: scholar.luck,
        affinity: 0,
    },
    classes: [{ classId: ClassId.RuneApprentice, level: 1 }],
    knowledge: ["火焰", "投射", "區域", "火之燃燒", "冰霜", "移動減速", "魔法解析"],
};
