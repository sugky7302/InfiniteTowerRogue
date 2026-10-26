import {
    batch,
    computed,
    config,
    effect,
    linkedSignal,
    localComputed,
    localEffect,
    localLinkedSignal,
    localSignal,
    of,
    signal,
    Subscription,
    take,
    toObservable,
    toSignal,
    untracked,
} from "../../src/shared/rxwc3";

function check(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

// 這個檔案由 Lua 驗證工具轉譯並執行，不由 Node 測試載入。
export function verifySignals(): number {
    let groups = 0;
    const source = signal(1);
    check(source() === 1, "Signal 初始讀取錯誤。");
    source.set(2);
    source.update((value) => value + 1);
    check(source() === 3, "Signal 點號寫入或更新錯誤。");
    check(source.asReadOnly()() === 3, "唯讀 Signal 串接呼叫錯誤。");
    check(source.asReadOnly().syncKind === "sync", "唯讀 Signal 標記錯誤。");
    groups++;

    let calculations = 0;
    const b = computed(() => {
        calculations++;
        return source() * 2;
    });
    const c = computed(() => source() * 3);
    const d = computed(() => b() + c());
    check(calculations === 0, "computed 沒有延遲計算。");
    check(d() === 15 && d() === 15 && calculations === 1, "computed 快取錯誤。");
    const values: number[] = [];
    const ref = effect(() => {
        values.push(d());
    });
    source.set(4);
    check(values.length === 2 && values[1] === 20, "菱形依賴產生中間值或重複通知。");
    batch(() => {
        source.set(5);
        batch(() => {
            source.set(6);
        });
        check(values.length === 2, "巢狀批次過早執行副作用。");
        check(d() === 30, "批次內讀取錯誤。");
    });
    check(values.length === 3 && values[2] === 30, "批次結束通知錯誤。");
    ref.destroy();
    groups++;

    let parityRuns = 0;
    const parity = computed(() => source() % 2);
    const parityEffect = effect(() => {
        parity();
        parityRuns++;
    });
    source.set(8);
    check(parityRuns === 1, "相等的 computed 結果仍觸發副作用。");
    source.set(9);
    check(parityRuns === 2, "computed 變更沒有通知。");
    parityEffect.destroy();
    groups++;

    const choose = signal(true);
    const other = signal(7);
    const dynamic = computed(() => (choose() ? source() : other()));
    let dynamicRuns = 0;
    const dynamicEffect = effect(() => {
        dynamic();
        dynamicRuns++;
    });
    choose.set(false);
    source.set(10);
    check(dynamicRuns === 2, "動態依賴沒有移除舊來源。");
    other.set(8);
    check(dynamicRuns === 3, "動態依賴沒有追蹤新來源。");
    dynamicEffect.destroy();
    groups++;

    const linked = linkedSignal(source);
    check(linked() === 10, "連結 Signal 不能接收可呼叫資料表。");
    linked.set(20);
    linked.update((value) => value + 1);
    check(linked.asReadOnly()() === 21, "連結 Signal 手動寫入錯誤。");
    source.set(11);
    check(linked() === 11, "連結 Signal 沒有重設。");
    let previous = 0;
    const full = linkedSignal<number, number>({
        source,
        computation: (value, last) => {
            previous = last === undefined ? 0 : last.value;
            return value * 2;
        },
    });
    check(full() === 22, "完整連結 Signal 初始計算錯誤。");
    full.set(30);
    source.set(12);
    check(full() === 24 && previous === 30, "完整連結 Signal 的上一個值錯誤。");
    groups++;

    let cleanups = 0;
    const owner = new Subscription();
    const cleanupEffect = effect((onCleanup) => {
        source();
        untracked(() => other());
        onCleanup(() => {
            cleanups++;
        });
    });
    owner.add(cleanupEffect);
    other.set(9);
    check(cleanups === 0, "untracked 建立了依賴。");
    source.set(13);
    owner.unsubscribe();
    check(cleanups === 2 && cleanupEffect.closed, "副作用清理或擁有者取消錯誤。");
    groups++;

    const saved = config.onUnhandledError;
    let errors = 0;
    config.onUnhandledError = () => {
        errors++;
    };
    try {
        const invalid = computed(() => {
            source.set(99);
            return source();
        });
        check(invalid() === 13 && source() === 13 && errors === 1, "computed 寫入沒有被拒絕。");
        const failing = effect(() => {
            source();
            throw new Error("預期的副作用錯誤。");
        });
        let healthyRuns = 0;
        const healthy = effect(() => {
            source();
            healthyRuns++;
        });
        source.set(14);
        check(errors === 3 && healthyRuns === 2, "副作用錯誤沒有隔離。");
        failing.destroy();
        healthy.destroy();
        const loop = signal(0);
        let loopRuns = 0;
        const stopped = effect(() => {
            loopRuns++;
            loop.set(loop() + 1);
        });
        check(loopRuns === 100 && stopped.closed && errors === 4, "副作用循環沒有停止。");
    } finally {
        config.onUnhandledError = saved;
    }
    groups++;

    const local = localSignal(1);
    const localDerived = localComputed(() => local() + source());
    const localLinked = localLinkedSignal({ source: local, computation: (value) => value * 2 });
    let localRuns = 0;
    const localRef = localEffect(() => {
        localDerived();
        localLinked();
        localRuns++;
    });
    local.set(2);
    check(localRuns === 2 && localLinked.asReadOnly()() === 4, "本地 Signal 執行錯誤。");
    config.onUnhandledError = () => {
        errors++;
    };
    try {
        const before = errors;
        computed(() => local())();
        check(errors === before + 1, "同步性檢查沒有報告錯誤。");
        config.checkSignalSync = false;
        computed(() => local())();
        check(errors === before + 1, "關閉同步性檢查後仍報告錯誤。");
    } finally {
        config.checkSignalSync = true;
        config.onUnhandledError = saved;
        localRef.destroy();
    }
    groups++;

    const observableValues: number[] = [];
    const subscription = toObservable(source).subscribe((value) => {
        observableValues.push(value);
    });
    source.set(15);
    subscription.unsubscribe();
    source.set(16);
    check(
        observableValues.length === 2 && observableValues[0] === 14 && observableValues[1] === 15,
        "Signal 轉串流或取消錯誤。",
    );
    const once: number[] = [];
    toObservable(source)
        .pipe(take(1))
        .subscribe((value) => {
            once.push(value);
        });
    source.set(17);
    check(once.length === 1 && once[0] === 16, "同步取消沒有移除內部副作用。");
    check(toSignal(of(1, 2), 0)() === 2, "串流轉 Signal 錯誤。");
    const conversionOwner = new Subscription();
    const converted = toSignal(toObservable(local), 0, { owner: conversionOwner });
    check(converted() === 2 && converted.syncKind === "local", "串流轉換沒有保留本地標記。");
    conversionOwner.unsubscribe();
    local.set(3);
    check(converted() === 2, "串流轉 Signal 的擁有者沒有取消訂閱。");
    groups++;
    return groups;
}
