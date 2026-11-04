import { UnitOrderEvent } from "../types/events";

/** 單位的原生動作、武器與生命顯示。 */
export interface UnitActionNatives {
    timeScale(target: unit, value: number): void;
    weaponEnabled(target: unit, index: number): boolean;
    setWeaponEnabled(target: unit, index: number, value: boolean): void;
    attackRange(target: unit): number;
    collision(target: unit): number;
    displayLife(target: unit, maximum: number, current: number): void;
    life(target: unit): number;
    disableLifeRegen(target: unit): void;
    pauseUnit(target: unit, paused: boolean): void;
    invulnerable(target: unit): boolean;
    setInvulnerable(target: unit, value: boolean): void;
    targetFlags(target: unit): number;
    setTargetFlags(target: unit, value: number): void;
    animation(target: unit, name: string): void;
    remove(target: unit): void;
    move(target: unit, x: number, y: number): void;
    face(target: unit, radians: number): void;
    issue(target: unit, order: UnitOrderEvent): void;
}
