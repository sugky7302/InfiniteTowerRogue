let localExecution = false;

/** 供受保護呼叫保存並恢復本地執行狀態。 */
export function setLocalExecution(value: boolean): void {
    localExecution = value;
}

export function isLocalExecution(): boolean {
    return localExecution;
}

export function runLocal<T>(callback: (this: void) => T): T {
    const previous = localExecution;
    localExecution = true;
    try {
        return callback();
    } finally {
        localExecution = previous;
    }
}
