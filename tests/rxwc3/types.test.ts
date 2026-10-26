import {
  distinctUntilChanged, filter, finalize, from, Local, LocalObservable, map, merge, mergeMap,
  Observable, of, pipe, scan, share, Subject, Sync, switchMap, take, takeUntil,
  takeWhile, tap,
} from "../../src/shared/rxwc3";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type LocalAlias = Assert<Equal<LocalObservable<number>, Observable<number, Local>>>;

function acceptsSync(source: Observable<number, Sync>): void {}
const local = new Observable<number, Local>();
const sync = of(1);
acceptsSync(sync);
// @ts-expect-error 本地串流不能傳入同步入口。
acceptsSync(local);
// @ts-expect-error 本地 Subject 不能傳入同步入口。
acceptsSync(new Subject<number, Local>());

const syncMerge = merge(sync, of(2));
const localMerge = merge(sync, local);
const reverseMerge = merge(local, sync);
const emptyMerge = merge();
const unionMerge = merge(sync as Observable<number, Sync | Local>);
const mixedMerge = merge(sync, of("值"));
type SyncMerge = Assert<Equal<typeof syncMerge, Observable<number, Sync>>>;
type LocalMerge = Assert<Equal<typeof localMerge, Observable<number, Local>>>;
type ReverseMerge = Assert<Equal<typeof reverseMerge, Observable<number, Local>>>;
type EmptyMerge = Assert<Equal<typeof emptyMerge, Observable<never, Sync>>>;
type UnionMerge = Assert<Equal<typeof unionMerge, Observable<number, Local>>>;
type MixedMerge = Assert<Equal<typeof mixedMerge, Observable<number | string, Sync>>>;
acceptsSync(syncMerge);
// @ts-expect-error 合併本地串流後不能傳入同步入口。
acceptsSync(localMerge);

const preserved = local.pipe(
  map(value => value + 1),
  scan((state, value) => state + value, 0),
  tap(() => {}),
  filter(value => value > 0),
  take(2),
  takeUntil(of(1)),
  takeWhile(value => value > 0),
  distinctUntilChanged(),
  share(),
).pipe(finalize(() => {}));
type Preserved = Assert<Equal<typeof preserved, Observable<number, Local>>>;
const fromLocal = from(local);
type FromLocal = Assert<Equal<typeof fromLocal, Observable<number, Local>>>;

const mergedInner = sync.pipe(mergeMap(() => local));
const switchedInner = sync.pipe(switchMap(() => local));
const mergedOuter = local.pipe(mergeMap(value => of(value)));
const switchedOuter = local.pipe(switchMap(value => of(value)));
const allSync = sync.pipe(mergeMap(value => of(value)), switchMap(value => of(value)));
type MergedInner = Assert<Equal<typeof mergedInner, Observable<number, Local>>>;
type SwitchedInner = Assert<Equal<typeof switchedInner, Observable<number, Local>>>;
type MergedOuter = Assert<Equal<typeof mergedOuter, Observable<number, Local>>>;
type SwitchedOuter = Assert<Equal<typeof switchedOuter, Observable<number, Local>>>;
type AllSync = Assert<Equal<typeof allSync, Observable<number, Sync>>>;
const composed = pipe(map((value: number) => value + 1), take<number>(2));
const composedLocal = composed(local);
const composedSync = composed(sync);
type ComposedLocal = Assert<Equal<typeof composedLocal, Observable<number, Local>>>;
type ComposedSync = Assert<Equal<typeof composedSync, Observable<number, Sync>>>;
// @ts-expect-error 本地內層會使合併結果成為本地串流。
acceptsSync(mergedInner);
// @ts-expect-error 本地內層會使切換結果成為本地串流。
acceptsSync(switchedInner);
