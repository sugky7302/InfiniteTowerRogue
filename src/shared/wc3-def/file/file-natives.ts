/** 只包裝原生操作。所有方法均不得建立原生 handle。 */
export interface FileNatives {
    getIcon(ability: number): string | undefined;
    setIcon(text: string, ability: number): void;
    clear(): void;
    start(): void;
    emit(line: string): void;
    finish(path: string): void;
    load(path: string): void;
}
