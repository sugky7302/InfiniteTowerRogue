import { reportUnhandledError } from "../core/config";
import { Observable } from "../core/observable";
import { Subject } from "../core/subject";
import { Subscriber } from "../core/subscriber";
import { TeardownLogic } from "../core/subscription";
import { EventNatives, TriggerHandle, UnitHandle, UnitInput } from "./event-natives";

interface Entry<T> {
  subscriber: Subscriber<T>;
  order: number;
  previous?: Entry<T>;
  next?: Entry<T>;
}

// M3 專用 Subject。保留原 Subject 行為，僅在中樞中提供跨路由的訂閱順序。
class RouteSubject<T> extends Subject<T> {
  public readonly entries: Entry<T>[] = [];
  public count = 0;
  public dirty = false;

  public constructor(private readonly hub: EventHub<T>, private readonly empty?: (this: void) => void) { super(); }

  protected subscribeActual(subscriber: Subscriber<T>): TeardownLogic {
    const entry = this.hub.append(subscriber);
    this.entries.push(entry);
    this.count++;
    subscriber.add(() => {
      this.hub.remove(entry);
      this.count--;
      if (this.count === 0 && this.empty !== undefined) this.empty();
      this.hub.clean(this);
    });
    this.hub.ensureTrigger();
  }

  public compactEntries(): void {
    let count = 0;
    for (const entry of this.entries) {
      if (!entry.subscriber.closed) this.entries[count++] = entry;
    }
    this.entries.length = count;
    this.dirty = false;
  }
}

// 純邏輯中樞。原生註冊與資料讀取由呼叫者注入。
export class EventHub<T> extends Observable<T> {
  private readonly global = new RouteSubject<T>(this);
  private readonly primary = new Map<UnitHandle, RouteSubject<T>>();
  private readonly secondary = new Map<UnitHandle, RouteSubject<T>>();
  private readonly dirty: RouteSubject<T>[] = [];
  private first: Entry<T> | undefined;
  private last: Entry<T> | undefined;
  private sequence = 0;
  private depth = 0;
  private trigger: TriggerHandle | undefined;

  public constructor(
    private readonly natives: EventNatives,
    private readonly register: (this: void, trigger: TriggerHandle) => void,
    private readonly receive: (this: void, hub: EventHub<T>) => void,
    private readonly primaryKey: (this: void, value: T) => UnitHandle | undefined,
    private readonly secondaryKey?: (this: void, value: T) => UnitHandle | undefined,
  ) { super(); }

  protected subscribeActual(subscriber: Subscriber<T>): TeardownLogic { return this.global.subscribe(subscriber); }

  public select(input: UnitInput, secondary = false): Observable<T> {
    const unit = this.natives.unwrapUnit(input);
    const routes = secondary ? this.secondary : this.primary;
    // 只有訂閱才建立 Map 項目；單純呼叫 .of 不會讓中樞保留單位。
    return new Observable<T>(subscriber => {
      let subject = routes.get(unit);
      if (subject === undefined) {
        subject = new RouteSubject<T>(this, () => { routes.delete(unit); });
        routes.set(unit, subject);
      }
      try { subject.subscribe(subscriber); } finally {
        // 新增訂閱在連接清理前失敗時，也不得留下空的單位項目。
        if (subject.count === 0 && routes.get(unit) === subject) routes.delete(unit);
      }
    });
  }

  public routeCount(secondary = false): number { return (secondary ? this.secondary : this.primary).size; }
  public hasSubscribers(): boolean { return this.first !== undefined; }

  public ensureTrigger(): void {
    if (this.trigger !== undefined) return;
    const trigger = this.natives.createTrigger();
    this.trigger = trigger;
    try {
      this.natives.addAction(trigger, () => {
        try { this.receive(this); } catch (error) { reportUnhandledError(error); }
      });
      this.register(trigger);
    } catch (error) {
      this.trigger = undefined;
      this.natives.destroyTrigger(trigger);
      throw error;
    }
  }

  public append(subscriber: Subscriber<T>): Entry<T> {
    if (this.sequence >= 2147483000) {
      if (this.depth > 0) throw new Error("事件分發中的訂閱順序已達上限。");
      this.sequence = 0;
      let current = this.first;
      while (current !== undefined) {
        current.order = ++this.sequence;
        current = current.next;
      }
      if (this.sequence >= 2147483000) throw new Error("事件訂閱數已達上限。");
    }
    const entry: Entry<T> = { subscriber, order: ++this.sequence, previous: this.last };
    if (this.last === undefined) this.first = entry;
    else this.last.next = entry;
    this.last = entry;
    return entry;
  }

  public remove(entry: Entry<T>): void {
    if (entry.previous === undefined) this.first = entry.next;
    else entry.previous.next = entry.next;
    if (entry.next === undefined) this.last = entry.previous;
    else entry.next.previous = entry.previous;
    entry.previous = undefined;
    entry.next = undefined;
    if (this.first === undefined && this.depth === 0) this.sequence = 0;
  }

  public clean(subject: RouteSubject<T>): void {
    if (this.depth === 0) subject.compactEntries();
    else if (!subject.dirty) {
      subject.dirty = true;
      this.dirty.push(subject);
    }
  }

  public dispatch(value: T): void {
    const primaryKey = this.primaryKey(value);
    const secondaryKey = this.secondaryKey === undefined ? undefined : this.secondaryKey(value);
    const a = this.global.entries;
    const b = primaryKey === undefined ? undefined : this.primary.get(primaryKey)?.entries;
    const c = secondaryKey === undefined ? undefined : this.secondary.get(secondaryKey)?.entries;
    const al = a.length;
    const bl = b === undefined ? 0 : b.length;
    const cl = c === undefined ? 0 : c.length;
    let ai = 0, bi = 0, ci = 0;
    this.depth++;
    try {
      // 最多合併三組相關訂閱。保留初始長度，新增訂閱不接收目前事件。
      while (ai < al || bi < bl || ci < cl) {
        const ae = ai < al ? a[ai] : undefined;
        const be = bi < bl ? b![bi] : undefined;
        const ce = ci < cl ? c![ci] : undefined;
        let entry = ae;
        let route = 0;
        if (be !== undefined && (entry === undefined || be.order < entry.order)) { entry = be; route = 1; }
        if (ce !== undefined && (entry === undefined || ce.order < entry.order)) { entry = ce; route = 2; }
        if (route === 0) ai++;
        else if (route === 1) bi++;
        else ci++;
        if (entry !== undefined && !entry.subscriber.closed) {
          try { entry.subscriber.next(value); } catch (error) { reportUnhandledError(error); }
        }
      }
    } finally {
      this.depth--;
      if (this.depth === 0) {
        for (const subject of this.dirty) subject.compactEntries();
        this.dirty.length = 0;
      }
    }
  }
}
