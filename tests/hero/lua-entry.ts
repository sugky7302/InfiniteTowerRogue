import { heroCases } from "./integration-cases";
import { heroSaveCases } from "../hero-save/cases";
heroCases.push(...heroSaveCases);
export { heroCases, verifyHero } from "./integration-cases";
