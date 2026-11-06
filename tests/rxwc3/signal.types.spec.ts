import {
    computed,
    linkedSignal,
    Local,
    localComputed,
    localLinkedSignal,
    localSignal,
    Observable,
    Signal,
    signal,
    Sync,
    toObservable,
    toSignal,
    WritableSignal,
} from "../../src/shared/lib/rxwc3";

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
function acceptsSync(source: Signal<number, Sync>): void {}
const writable = signal(1);
const readonly = writable.asReadOnly();
acceptsSync(readonly);
// @ts-expect-error 唯讀 Signal 沒有 set。
readonly.set(2);
// @ts-expect-error 唯讀 Signal 沒有 update。
readonly.update((value: number) => value + 1);
const local = localSignal(1);
// @ts-expect-error 本地 Signal 不能傳入同步入口。
acceptsSync(local);
// @ts-expect-error 本地唯讀 Signal 不能傳入同步入口。
acceptsSync(local.asReadOnly());
const localSource = new Observable<number, Local>();
const converted = toSignal(localSource, 0);
type Converted = Assert<Equal<typeof converted, Signal<number, Local>>>;
// @ts-expect-error 轉換後仍為本地 Signal。
acceptsSync(converted);
const observable = toObservable(local);
type ObservableKind = Assert<Equal<typeof observable, Observable<number, Local>>>;
const syncObservable = toObservable(readonly);
type SyncObservableKind = Assert<Equal<typeof syncObservable, Observable<number, Sync>>>;
const syncConverted = toSignal(syncObservable, 0);
type SyncConverted = Assert<Equal<typeof syncConverted, Signal<number, Sync>>>;
const linked = linkedSignal<number, number>({
    source: writable,
    computation: (source, previous) => source + (previous?.value ?? 0),
});
const localLinked = localLinkedSignal({ source: local, computation: (source) => source });
const localSimple = localLinkedSignal(() => local());
type Linked = Assert<Equal<typeof linked, WritableSignal<number, Sync>>>;
type LocalLinked = Assert<Equal<typeof localLinked, WritableSignal<number, Local>>>;
type LocalSimple = Assert<Equal<typeof localSimple, WritableSignal<number, Local>>>;
const derived = computed(() => writable());
const localDerived = localComputed(() => local());
type Computed = Assert<Equal<typeof derived, Signal<number, Sync>>>;
type LocalComputed = Assert<Equal<typeof localDerived, Signal<number, Local>>>;
// @ts-expect-error 連結 Signal 的唯讀外觀沒有 set。
linked.asReadOnly().set(1);
// @ts-expect-error 轉換後的唯讀 Signal 沒有 set。
converted.set(1);
