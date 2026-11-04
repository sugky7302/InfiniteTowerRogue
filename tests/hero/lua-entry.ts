import { heroCases } from "./integration-cases";
import { heroSaveCases } from "../hero-save/cases";
import { inventoryCases } from "../inventory/cases";
heroCases.push(...heroSaveCases);
heroCases.push(...inventoryCases);
export { heroCases, verifyHero } from "./integration-cases";
export { wc3ItemCarrierNatives } from "@shared/wc3-def";
