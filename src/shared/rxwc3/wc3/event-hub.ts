import { reportUnhandledError } from "../core/config";
import { Observable } from "../core/observable";
import { Subject } from "../core/subject";
import { notifyNext, Subscriber } from "../core/subscriber";
import { protectedCall } from "../core/protected-call";
import { TeardownLogic } from "../core/subscription";
import { EventNatives } from "@shared/wc3-def/natives";
import { UnitInput } from "@shared/wc3-def/inputs";

/**
 * 一個訂閱者在中樞中的記錄。
 * - `order`：全域訂閱編號，由 `EventHub.append` 遞增配發。`dispatch` 依它決定跨路由的順序。
 * - `previous`／`next`：把中樞全部訂閱者串成雙向鏈結串列。只用於 `hasSubscribers()`，
 *   以及編號接近 int32 上限時重新編號（WC3 Lua 使用 32 位元整數）。
 */
interface Entry<T> {
    subscriber: Subscriber<T>;
    order: number;
    previous?: Entry<T>;
    next?: Entry<T>;
}

/**
 * 一條路由的 Subject，例如「全部事件」或「hero 的目標路由」。保留原 Subject 行為。
 * - `entries`：此路由的訂閱者。依訂閱先後加入，所以已依 `order` 排序。
 * - `count`：目前的訂閱者數量。降為 0 時呼叫 `empty()`，從 Map 刪除此單位，避免中樞保留單位參照。
 * - `dirty`：分發中有訂閱者取消時只標記，分發結束後才 `compactEntries()`。
 *   原因：效能規則禁止在分發時複製訂閱者陣列。
 */
class RouteSubject<T> extends Subject<T> {
    public readonly entries: Entry<T>[] = [];
    public count = 0;
    public dirty = false;

    public constructor(
        private readonly hub: EventHub<T>,
        private readonly empty?: (this: void) => void,
    ) {
        super();
    }

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

/**
 * 事件中樞：把一種 WC3 事件有效率地、依正確順序送給相關的訂閱者。純邏輯；原生註冊與資料讀取由呼叫者注入。
 *
 * 每種事件（例如 `onDamaging`）一個中樞。它有一個觸發器（第一個訂閱者出現時才建立，之後不刪除）與三條路由：
 * ```
 * EventHub（onDamaging）
 * ├─ global                             ← onDamaging.subscribe(...)：全部事件
 * ├─ primary   Map<unit, RouteSubject>  ← .ofTarget(hero)：依目標（施法事件為施法者）分組
 * └─ secondary Map<unit, RouteSubject>  ← .ofSource(boss)：依來源分組
 * ```
 * 事件發生時只查兩次 Map，就能找到相關的訂閱者，不必檢查全部訂閱者再 `filter`。
 *
 * 跨路由的順序：傷害修正依訂閱順序執行（已決策），但訂閱者分散在不同路由。例如：
 * ```
 * 訂閱順序：1. A（全部，增傷） 2. B（hero，護盾） 3. A'（全部，記錄）
 * global:  [A(1), A'(3)]
 * primary: [B(2)]
 * ```
 * 先通知 global 再通知 primary 會變成 A → A' → B，記錄會讀到尚未扣護盾的值。
 * 所以 `dispatch` 同時看三條清單的開頭，每次取出 `order` 最小者（與合併排序的「合併」步驟相同），
 * 結果為 A(1) → B(2) → A'(3)。
 *
 * 其他規則：
 * - 分發前記錄三條清單的長度。分發中新加入的訂閱者不收到目前事件。
 * - `depth`：目前的分發深度（傷害回呼中可能再造成傷害）。最外層分發結束時才清理 dirty 路由。
 * - `select`：`.ofTarget(u)` 只建立 Observable，真正訂閱時才建立 Map 項目。只呼叫而不訂閱不會保留單位。
 */
export class EventHub<T> extends Observable<T> {
    private readonly global = new RouteSubject<T>(this);
    private readonly primary = new Map<unit, RouteSubject<T>>();
    private readonly secondary = new Map<unit, RouteSubject<T>>();
    private readonly dirty: RouteSubject<T>[] = [];
    private first: Entry<T> | undefined;
    private last: Entry<T> | undefined;
    private sequence = 0;
    private depth = 0;
    private trigger: trigger | undefined;

    public constructor(
        private readonly natives: EventNatives,
        private readonly register: (this: void, trigger: trigger) => void,
        private readonly receive: (this: void, hub: EventHub<T>) => void,
        private readonly primaryKey: (this: void, value: T) => unit | undefined,
        private readonly secondaryKey?: (this: void, value: T) => unit | undefined,
    ) {
        super();
    }

    protected subscribeActual(subscriber: Subscriber<T>): TeardownLogic {
        return this.global.subscribe(subscriber);
    }

    public select(input: UnitInput, secondary = false): Observable<T> {
        const unit = this.natives.unwrapUnit(input);
        const routes = secondary ? this.secondary : this.primary;
        // 只有訂閱才建立 Map 項目；單純呼叫 .of 不會讓中樞保留單位。
        return new Observable<T>((subscriber) => {
            let subject = routes.get(unit);
            if (subject === undefined) {
                subject = new RouteSubject<T>(this, () => {
                    routes.delete(unit);
                });
                routes.set(unit, subject);
            }
            try {
                subject.subscribe(subscriber);
            } finally {
                // 新增訂閱在連接清理前失敗時，也不得留下空的單位項目。
                if (subject.count === 0 && routes.get(unit) === subject) routes.delete(unit);
            }
        });
    }

    public routeCount(secondary = false): number {
        return (secondary ? this.secondary : this.primary).size;
    }
    public hasSubscribers(): boolean {
        return this.first !== undefined;
    }

    public ensureTrigger(): void {
        if (this.trigger !== undefined) return;
        const trigger = this.natives.createTrigger();
        this.trigger = trigger;
        try {
            this.natives.addAction(trigger, () => {
                const [ok, error] = protectedCall(this.receive, this);
                if (!ok) reportUnhandledError(error);
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
        const c =
            secondaryKey === undefined ? undefined : this.secondary.get(secondaryKey)?.entries;
        const al = a.length;
        const bl = b === undefined ? 0 : b.length;
        const cl = c === undefined ? 0 : c.length;
        let ai = 0,
            bi = 0,
            ci = 0;
        this.depth++;
        // 最多合併三組相關訂閱。保留初始長度，新增訂閱不接收目前事件。
        while (ai < al || bi < bl || ci < cl) {
            const ae = ai < al ? a[ai] : undefined;
            const be = bi < bl ? b![bi] : undefined;
            const ce = ci < cl ? c![ci] : undefined;
            let entry = ae;
            let route = 0;
            if (be !== undefined && (entry === undefined || be.order < entry.order)) {
                entry = be;
                route = 1;
            }
            if (ce !== undefined && (entry === undefined || ce.order < entry.order)) {
                entry = ce;
                route = 2;
            }
            if (route === 0) ai++;
            else if (route === 1) bi++;
            else ci++;
            if (entry !== undefined && !entry.subscriber.closed) {
                notifyNext(entry.subscriber, value);
            }
        }
        this.depth--;
        if (this.depth === 0) {
            for (const subject of this.dirty) subject.compactEntries();
            this.dirty.length = 0;
        }
    }
}
