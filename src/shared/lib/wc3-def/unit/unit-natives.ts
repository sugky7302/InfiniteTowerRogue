/** 單位的查詢與命令。不建立需要保存的 handle。 */
export interface UnitNatives {
    stop(target: unit): void;
    x(target: unit): number;
    y(target: unit): number;
    /** 單位存在且沒有死亡。已移除的單位視為死亡。 */
    alive(target: unit): boolean;
    /** 目標是觀察者的敵人，且觀察者的玩家可以看見目標。 */
    enemyVisible(observer: unit, target: unit): boolean;
    speed(target: unit): number;
    setSpeed(target: unit, value: number): void;
    mana(target: unit): number;
    setMana(target: unit, value: number): void;
    regen(target: unit): number;
    setRegen(target: unit, value: number): void;
    unitType(target: unit): number;
    isHero(target: unit): boolean;
    /** 文字只供顯示。遊戲邏輯不得讀取或比較翻譯後的 GetUnitName 等文字。 */
    unitName(target: unit, text: string): void;
    heroName(target: unit, text: string): void;
    /** 共同流程建立列舉群組、區域與觸發器。回呼中不得建立 handle。 */
    watchUnits(callback: (this: void, target: unit) => void): (this: void) => void;
}

/** 造成固定數值的傷害。實作在共同流程建立觸發器。 */
export interface UnitDamageNatives {
    damage(source: unit, target: unit, amount: number): void;
}

/** 列舉範圍內的單位。實作在共同流程建立列舉群組。 */
export interface UnitAreaNatives {
    area(x: number, y: number, radius: number, visit: (this: void, target: unit) => void): void;
}
