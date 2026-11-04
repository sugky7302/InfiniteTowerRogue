/** prepare 只能在共同流程呼叫。其他方法不得建立原生 handle。 */
export interface FileNatives {
    prepare(abilities: readonly string[]): void;
    getTooltip(ability: string): string;
    setTooltip(text: string, ability: string): void;
    clear(): void;
    start(): void;
    emit(line: string): void;
    finish(path: string): void;
    load(path: string): void;
}
