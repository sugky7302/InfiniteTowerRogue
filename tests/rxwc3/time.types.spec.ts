import {
  debounceTime, delay, LocalObservable, Observable, throttleTime,
} from "../../src/shared/rxwc3";

// 此函式只供型別檢查，不由 Node 載入。
function checkTimeKinds(source: LocalObservable<number>, synced: Observable<number>): void {
  const delayed: LocalObservable<number> = source.pipe(delay(1));
  const throttled: LocalObservable<number> = source.pipe(throttleTime(1));
  const debounced: LocalObservable<number> = source.pipe(debounceTime(1));
  const preserved: Observable<number> = synced.pipe(delay(1), throttleTime(1), debounceTime(1));
  // @ts-expect-error 時間 operator 必須保留本地型別。
  const invalid: Observable<number> = delayed;
  void [delayed, throttled, debounced, preserved, invalid];
}
void checkTimeKinds;
