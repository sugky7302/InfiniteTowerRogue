import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FrameNatives } from "@shared/wc3-def";
import { runUiExperiment } from "../../src/app/ui-experiment";

type Call = { name: string; args: unknown[] };
type Options = { local?: number; main?: boolean; probe?: boolean; missing?: string };

function experiment(
    options: Options,
    check: (state: {
        calls: Call[];
        messages: { target: player; text: string }[];
        errors: string[];
        timers: Map<timer, { seconds: number; action: () => void }>;
        actions: Map<trigger, () => void>;
        registrations: { trigger: trigger; frame: framehandle; event: string }[];
        created: Map<string, framehandle>;
        start(): void;
        send(text: string, player?: number): void;
        select(): void;
        event(registration: number): void;
        stop(): void;
    }) => void,
): void {
    const calls: Call[] = [];
    const messages: { target: player; text: string }[] = [];
    const errors: string[] = [];
    const players = [{ id: 0 }, { id: 1 }] as unknown as player[];
    const hero = {} as unit;
    const timers = new Map<timer, { seconds: number; action: () => void }>();
    const actions = new Map<trigger, () => void>();
    const registrations: { trigger: trigger; frame: framehandle; event: string }[] = [];
    const created = new Map<string, framehandle>();
    const visibility = new Map<framehandle, boolean>();
    let actor = players[0];
    let text = "";
    let event = "";
    let chat: trigger;
    let selection: trigger;
    const globals: Record<string, unknown> = {
        CreateTimer: () => ({}),
        TimerStart: (timer: timer, seconds: number, _periodic: boolean, action: () => void) =>
            timers.set(timer, { seconds, action }),
        PauseTimer: () => {},
        DestroyTimer: (timer: timer) => timers.delete(timer),
        CreateTrigger: () => ({}),
        TriggerAddAction: (trigger: trigger, action: () => void) => actions.set(trigger, action),
        DestroyTrigger: (trigger: trigger) => actions.delete(trigger),
        TriggerRegisterPlayerChatEvent: (trigger: trigger) => {
            chat = trigger;
        },
        TriggerRegisterPlayerUnitEvent: (trigger: trigger) => {
            selection = trigger;
        },
        GetTriggerPlayer: () => actor,
        GetLocalPlayer: () => players[options.local ?? 0],
        Player: (index: number) => players[index],
        GetEventPlayerChatString: () => text,
        GetTriggerUnit: () => hero,
        GetTriggerEventId: () => "selected",
        GetUnitName: () => "測試英雄",
        DisplayTimedTextToPlayer: (
            target: player,
            _x: number,
            _y: number,
            _seconds: number,
            text: string,
        ) => messages.push({ target, text }),
        print: (text: string) => errors.push(text),
        bj_MAX_PLAYER_SLOTS: 2,
        ORIGIN_FRAME_GAME_UI: "origin",
        FRAMEPOINT_TOPLEFT: "topLeft",
        FRAMEPOINT_BOTTOMLEFT: "bottomLeft",
        FRAMEPOINT_CENTER: "center",
        FRAMEEVENT_CONTROL_CLICK: "click",
        FRAMEEVENT_MOUSE_ENTER: "enter",
        FRAMEEVENT_MOUSE_LEAVE: "leave",
        EVENT_PLAYER_UNIT_SELECTED: "selected",
        EVENT_PLAYER_UNIT_DESELECTED: "deselected",
    };
    const saved = Object.keys(globals).map(
        (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    for (const [key, value] of Object.entries(globals))
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    const natives = new Proxy({} as FrameNatives, {
        get(_target, property) {
            const name = String(property);
            return (...args: unknown[]) => {
                calls.push({ name, args });
                switch (name) {
                    case "loadTOC":
                        return String(args[0]).includes("no-trailing")
                            ? options.probe !== false
                            : options.main !== false;
                    case "fromOrigin":
                        return {} as framehandle;
                    case "create": {
                        const key = args[0] + ":" + args[3];
                        if (
                            key === options.missing ||
                            (args[0] === "ItrProbeText" && options.probe === false)
                        )
                            return undefined;
                        const handle = { key } as unknown as framehandle;
                        created.set(key, handle);
                        return handle;
                    }
                    case "fromName":
                        return { key: args[0] + ":" + args[1] } as unknown as framehandle;
                    case "getEventType":
                        return event;
                    case "setVisible":
                        visibility.set(args[0] as framehandle, args[1] as boolean);
                        return;
                    case "isVisible":
                        return visibility.get(args[0] as framehandle) === true;
                    case "registerEvent":
                        registrations.push({
                            trigger: args[0] as trigger,
                            frame: args[1] as framehandle,
                            event: args[2] as string,
                        });
                        return;
                }
            };
        },
    });
    let stop: (() => void) | undefined;
    try {
        stop = runUiExperiment({ nativeUnit: hero }, "既有英雄模型.mdl", natives);
        check({
            calls,
            messages,
            errors,
            timers,
            actions,
            registrations,
            created,
            start: () => {
                [...timers.values()].find((timer) => timer.seconds === 0)!.action();
            },
            send: (message, player = 0) => {
                actor = players[player];
                text = message;
                actions.get(chat)!();
            },
            select: () => actions.get(selection)!(),
            event: (index) => {
                const entry = registrations[index];
                event = entry.event;
                actions.get(entry.trigger)!();
            },
            stop,
        });
    } finally {
        stop?.();
        for (const [key, value] of saved) {
            if (value === undefined) Reflect.deleteProperty(globalThis, key);
            else Object.defineProperty(globalThis, key, value);
        }
    }
}

test("I3 全部用戶端建立相同框架，TOC 只載入一次，只有本人顯示", () => {
    const sequences: string[][] = [];
    for (const local of [0, 1]) {
        experiment({ local }, (state) => {
            assert.equal(state.calls.length, 0);
            state.start();
            state.send("-ui-toc");
            state.send("-ui-toc");
            assert.equal(state.calls.filter((call) => call.name === "loadTOC").length, 2);
            state.send("-ui-show");
            const count = state.created.size;
            state.send("-ui-show");
            assert.equal(state.created.size, count);
            assert.equal(count, 12);
            assert.equal(state.registrations.length, 11);
            assert.equal(state.actions.size, 7);
            assert.equal(state.calls.filter((call) => call.name === "fromOrigin").length, 1);
            const panel = state.created.get("ItrPanel:100")!;
            assert.equal(
                state.calls.filter(
                    (call) =>
                        call.name === "setVisible" &&
                        call.args[0] === panel &&
                        call.args[1] === true,
                ).length,
                local === 0 ? 2 : 0,
            );
            assert.ok(
                state.calls.some(
                    (call) => call.name === "setModel" && call.args[1] === "既有英雄模型.mdl",
                ),
            );
            assert.ok(
                state.calls.some((call) => call.name === "setSpriteAnimate" && call.args[1] === 2),
            );
            sequences.push(
                state.calls
                    .filter((call) => ["create", "fromName"].includes(call.name))
                    .map(
                        (call) =>
                            call.name +
                            ":" +
                            call.args[0] +
                            ":" +
                            (call.name === "create" ? call.args[3] : call.args[1]),
                    ),
            );
        });
    }
    assert.deepEqual(sequences[0], sequences[1]);
});

test("I3 各格事件保留編號，模型接受零座標及 birth 零屬性，拒絕錯誤參數", () => {
    experiment({}, (state) => {
        state.start();
        state.send("-ui-show");
        for (let index = 0; index < 3; index++) {
            state.event(index * 3);
            state.event(index * 3 + 1);
            state.event(index * 3 + 2);
            assert.ok(
                state.messages.some((message) => message.text === "已點擊：格子 " + (index + 1)),
            );
            assert.ok(
                state.messages.some((message) => message.text === "滑鼠移入格子：" + (index + 1)),
            );
        }
        assert.equal(state.calls.filter((call) => call.name === "resetFocus").length, 3);
        state.send("-ui-model 0 0 0.0008");
        assert.deepEqual(
            state.calls
                .filter((call) => call.name === "setPoint")
                .at(-1)!
                .args.slice(-2),
            [0, 0],
        );
        state.send("-ui-anim birth");
        assert.equal(
            state.calls.filter((call) => call.name === "setSpriteAnimate").at(-1)!.args[1],
            0,
        );
        const animations = state.calls.filter((call) => call.name === "setSpriteAnimate").length;
        const scales = state.calls.filter((call) => call.name === "setScale").length;
        for (const command of [
            "-ui-model 0 0 0",
            "-ui-model 2147483648 0 1",
            "-ui-model 0 0 Infinity",
            "-ui-model 字 0 1",
            "-ui-model",
            "-ui-anim attack",
            "-ui-anim",
        ])
            state.send(command);
        assert.equal(
            state.calls.filter((call) => call.name === "setSpriteAnimate").length,
            animations,
        );
        assert.equal(state.calls.filter((call) => call.name === "setScale").length, scales);
        assert.ok(state.errors.some((message) => message.includes("沒有可用的 attack")));
    });
});

test("I3 選取觀察不隱藏面板，十秒後停止，重複啟動與停止完整清理", () => {
    experiment({}, (state) => {
        state.start();
        state.send("-ui-show");
        state.send("-ui-select");
        state.send("-ui-select");
        assert.equal(state.timers.size, 1);
        const visibilityCalls = state.calls.filter((call) => call.name === "setVisible").length;
        state.select();
        assert.ok(state.messages.at(-1)!.text.includes("英雄）。面板：可見"));
        assert.equal(
            state.calls.filter((call) => call.name === "setVisible").length,
            visibilityCalls,
        );
        [...state.timers.values()][0].action();
        assert.equal(state.timers.size, 0);
        const messages = state.messages.length;
        state.select();
        assert.equal(state.messages.length, messages);
        state.send("-ui-hide");
        state.send("-ui-show");
        state.send("-ui-select");
        state.send("-ui-stop");
        state.stop();
        assert.equal(state.actions.size, 0);
        assert.equal(state.timers.size, 0);
        assert.equal(state.calls.filter((call) => call.name === "destroy").length, 2);
    });
});

test("I3 探測或個別樣板失敗不阻止其他實驗，停止前的部分資源仍會清理", () => {
    experiment({ probe: false, missing: "ItrSlotButton:2" }, (state) => {
        state.start();
        state.send("-ui-toc");
        assert.ok(state.messages.at(-1)!.text.includes("ItrProbeText：建立失敗"));
        state.send("-ui-show");
        assert.ok(state.created.has("ItrModelPreview:400"));
        assert.ok(state.errors.some((message) => message.includes("ItrSlotButton（2）：建立失敗")));
        state.stop();
        assert.equal(state.calls.filter((call) => call.name === "destroy").length, 1);
    });
    experiment({ main: false }, (state) => {
        state.start();
        state.send("-ui-show");
        assert.ok(!state.created.has("ItrPanel:100"));
        assert.ok(state.errors.some((message) => message.includes("主 TOC 載入失敗")));
    });
    experiment({}, (state) => {
        state.stop();
        assert.equal(state.timers.size, 0);
        assert.equal(state.calls.length, 0);
    });
});
