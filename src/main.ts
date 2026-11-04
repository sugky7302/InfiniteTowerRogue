import { W3TS_HOOK, addScriptHook } from "w3ts/hooks";
import { logger } from "@shared/logger";
import { runSaveExample } from "./app/save-example";
import { runSkillExample, skillHeroModel } from "./app/skill-example";
import { createHeroSaveParticipants } from "./app/hero-save";
import { runUiExperiment } from "./app/ui-experiment";

const BUILD_DATE = compiletime(() => new Date().toUTCString());
const TS_VERSION = compiletime(() => require("typescript").version);
const TSTL_VERSION = compiletime(() => require("typescript-to-lua").version);

compiletime(({ objectData, constants }) => {
    const unit = objectData.units.get(constants.units.Footman);

    if (!unit) {
        return;
    }

    unit.modelFile = "units\\human\\TheCaptain\\TheCaptain.mdl";

    objectData.save();
});

function tsMain() {
    try {
        print(`Build: ${BUILD_DATE}`);
        print(`Typescript: v${TS_VERSION}`);
        print(`Transpiler: v${TSTL_VERSION}`);
        print(" ");
        print("Welcome to TypeScript!");
    } catch (e) {
        logger.error(e);
    }
}

addScriptHook(W3TS_HOOK.MAIN_AFTER, tsMain);
addScriptHook(W3TS_HOOK.MAIN_AFTER, () => {
    const hero = runSkillExample();
    runSaveExample(createHeroSaveParticipants(Player(0)!, hero));
    runUiExperiment(hero, skillHeroModel);
});
