import { computed, effect, filter, map, scan, signal, Subject, Subscription, tap } from "../index";
import { EventHub } from "../wc3/event-hub";
import { EventNatives } from "@shared/lib/wc3-def";

export type Mode = "rx" | "native";
export interface Workload {
    step(this: void): void;
    checksum(this: void): number;
    dispose(this: void): void;
}
export interface Case {
    id: string;
    kind: "subject" | "hub" | "operators" | "signal";
    width: number;
}

export const cases: Case[] = [
    { id: "B1-subject-1", kind: "subject", width: 1 },
    { id: "B1-subject-20", kind: "subject", width: 20 },
    { id: "B1-subject-100", kind: "subject", width: 100 },
    { id: "B1-hub-1", kind: "hub", width: 1 },
    { id: "B1-hub-20", kind: "hub", width: 20 },
    { id: "B1-hub-100", kind: "hub", width: 100 },
    { id: "B2", kind: "operators", width: 1 },
    { id: "B3-10", kind: "signal", width: 10 },
    { id: "B3-100", kind: "signal", width: 100 },
];

/** 純分發不呼叫 WC3。只替換公開 EventHub 建構子的原生依賴。 */
function hubNatives(): EventNatives {
    const unused = (): never => {
        throw new Error("純分發不應讀取原生事件。");
    };
    return {
        createTrigger: () => ({}) as trigger,
        destroyTrigger: () => {},
        addAction: () => {},
        unwrapUnit: (input) => ("handle" in input ? input.handle : input),
        registerUnitEvent: () => {},
        registerChat: () => {},
        readDamage: () => unused(),
        readSpell: () => unused(),
        readOrder: () => unused(),
        readDeath: () => unused(),
        readChat: () => unused(),
        setDamageAmount: () => {},
        setDamageAttackType: () => false,
        setDamageDamageType: () => false,
        setDamageWeaponType: () => false,
    };
}

export function createWorkload(spec: Case, mode: Mode): Workload {
    const owner = new Subscription();
    let input = 0;
    let output = 0;
    let emit: (this: void, value: number) => void;
    if (spec.kind === "subject" || spec.kind === "hub") {
        const receive = (value: number): void => {
            output = (output + value) % 10000;
        };
        if (mode === "native") {
            const callbacks: ((this: void, value: number) => void)[] = [];
            for (let index = 0; index < spec.width; index++) callbacks.push(receive);
            emit = (value) => {
                for (const callback of callbacks) callback(value);
            };
        } else if (spec.kind === "subject") {
            const subject = new Subject<number>();
            for (let index = 0; index < spec.width; index++) owner.add(subject.subscribe(receive));
            emit = (value) => subject.next(value);
        } else {
            const hub = new EventHub<number>(
                hubNatives(),
                () => {},
                () => {},
                () => undefined,
            );
            for (let index = 0; index < spec.width; index++) owner.add(hub.subscribe(receive));
            emit = (value) => hub.dispatch(value);
        }
    } else if (spec.kind === "operators") {
        if (mode === "native") {
            let total = 0;
            emit = (value) => {
                if (value % 2 === 0) {
                    const mapped = value + 1;
                    total = (total + mapped) % 10000;
                    const transformed = total * 2;
                    output = transformed;
                }
            };
        } else {
            const subject = new Subject<number>();
            owner.add(
                subject
                    .pipe(
                        filter((value) => value % 2 === 0),
                        map((value) => value + 1),
                        scan((total, value) => (total + value) % 10000, 0),
                        map((value) => value * 2),
                        tap((value) => {
                            output = value;
                        }),
                    )
                    .subscribe(),
            );
            emit = (value) => subject.next(value);
        }
    } else {
        const values: number[] = [];
        if (mode === "native") {
            emit = (value) => {
                for (let index = 0; index < spec.width; index++) values[index] = value + index;
            };
            emit(0);
        } else {
            const source = signal(0);
            for (let index = 0; index < spec.width; index++) {
                const id = index;
                const derived = computed(() => source() + id);
                owner.add(
                    effect(() => {
                        values[id] = derived();
                    }),
                );
            }
            emit = (value) => source.set(value);
        }
        return {
            step: () => {
                input = (input % 9999) + 1;
                emit(input);
            },
            checksum: () => {
                let sum = 0;
                for (const value of values) sum += value;
                return sum;
            },
            dispose: () => owner.unsubscribe(),
        };
    }
    return {
        step: () => {
            input = (input % 9999) + 1;
            emit(input);
        },
        checksum: () => output,
        dispose: () => owner.unsubscribe(),
    };
}
