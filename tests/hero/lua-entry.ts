import { heroCases } from "./integration-cases";
import { heroSaveCases } from "../hero-save/cases";
import { inventoryCases } from "../inventory/cases";
import { inventoryUiCases } from "../ui/cases";
heroCases.push(...heroSaveCases);
heroCases.push(...inventoryCases);
heroCases.push(...inventoryUiCases);
export { heroCases, verifyHero } from "./integration-cases";
export { wc3ItemCarrierNatives } from "@shared/wc3-def";
