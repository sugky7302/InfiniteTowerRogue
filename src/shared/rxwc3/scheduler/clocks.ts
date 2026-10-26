import { Clock } from "./clock";
import { Phase } from "./phase";

export interface TimeOptions {
  clock?: Clock;
  phase?: Phase;
}

export const worldClock = new Clock();
export const uiClock = new Clock();
