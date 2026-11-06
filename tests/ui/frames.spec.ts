import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runeScholar } from "@entities/character";
import { createItem, ItemBaseId } from "@entities/item";
import {
    InventoryPort,
    InventorySnapshot,
    createBag,
    emptyEquipment,
    inventoryTransition,
} from "@features/equipment";
import { FrameNatives } from "@shared/lib/wc3-def";
import { runInventoryUi } from "../../src/app/inventory-ui";

type Call = { name: string; args: unknown[] };
function fixture(local = 0, missing = "", toc = true) {
    const players = [{ id: 0 }, { id: 1 }] as unknown as player[];
    let actor = players[0];
    let chatText = "";
    let kind = "";
    let chat: trigger | undefined;
    const calls: Call[] = [];
    const errors: string[] = [];
    const actions = new Map<trigger, () => void>();
    const timers = new Map<timer, () => void>();
    const handles = new Map<string, framehandle>();
    const events: { target: trigger; frame: framehandle; event: string }[] = [];
    const listeners: (() => void)[] = [];
    let sends = 0;
    const bag = [...createBag()];
    bag[0] = createItem(1, ItemBaseId.TrainingSword, (low) => low);
    let snapshot: InventorySnapshot = { hero: runeScholar, worn: emptyEquipment(), bag };
    const port: InventoryPort = {
        read: () => snapshot,
        send(selection, event) {
            sends++;
            const result = inventoryTransition(snapshot, selection, event);
            if (result.changed) {
                snapshot = { ...snapshot, worn: result.worn, bag: result.bag };
                for (const listener of listeners) listener();
            }
            return result;
        },
        subscribe(listener) {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
    };
    const globals: Record<string, unknown> = {
        CreateTimer: () => ({}),
        TimerStart: (timer: timer, seconds: number, periodic: boolean, action: () => void) => {
            assert.equal(seconds, 0);
            assert.equal(periodic, false);
            timers.set(timer, action);
        },
        PauseTimer: () => {},
        DestroyTimer: (timer: timer) => timers.delete(timer),
        CreateTrigger: () => ({}),
        TriggerAddAction: (target: trigger, action: () => void) => actions.set(target, action),
        DestroyTrigger: (target: trigger) => actions.delete(target),
        TriggerRegisterPlayerChatEvent: (
            target: trigger,
            player: player,
            text: string,
            exact: boolean,
        ) => {
            assert.equal(player, players[0]);
            assert.equal(text, "-bag");
            assert.equal(exact, true);
            chat = target;
        },
        GetTriggerPlayer: () => actor,
        GetLocalPlayer: () => players[local],
        GetEventPlayerChatString: () => chatText,
        print: (value: unknown) => errors.push(String(value)),
        ORIGIN_FRAME_GAME_UI: "origin",
        FRAMEPOINT_TOPLEFT: "topLeft",
        FRAMEPOINT_BOTTOMLEFT: "bottomLeft",
        FRAMEEVENT_CONTROL_CLICK: "click",
        FRAMEEVENT_MOUSE_ENTER: "enter",
        FRAMEEVENT_MOUSE_LEAVE: "leave",
    };
    const saved = Object.keys(globals).map(
        (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
    );
    for (const [key, value] of Object.entries(globals))
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    const frames = new Proxy({} as FrameNatives, {
        get(_target, property) {
            const name = String(property);
            return (...args: unknown[]) => {
                calls.push({ name, args });
                if (name === "isVisible") throw new Error("不得讀取本地可見值。");
                if (name === "loadTOC") return toc;
                if (name === "fromOrigin") return { key: "origin" };
                if (name === "create" || name === "fromName") {
                    const key = String(args[0]) + ":" + (name === "create" ? args[3] : args[1]);
                    if (key === missing) return undefined;
                    const handle = { key } as unknown as framehandle;
                    handles.set(key, handle);
                    return handle;
                }
                if (name === "getEventType") return kind;
                if (name === "registerEvent")
                    events.push({
                        target: args[0] as trigger,
                        frame: args[1] as framehandle,
                        event: String(args[2]),
                    });
                return undefined;
            };
        },
    });
    const stop = runInventoryUi(port, players[0], frames);
    return {
        calls,
        handles,
        errors,
        timers,
        actions,
        events,
        listeners,
        snapshot: () => snapshot,
        sends: () => sends,
        start() {
            [...timers.values()][0]();
        },
        event(key: string, event = "click", player = 0) {
            actor = players[player];
            kind = event;
            const target = events.find(
                (entry) => entry.frame === handles.get(key) && entry.event === event,
            );
            assert.ok(target, "找不到框架事件：" + key);
            actions.get(target.target)!();
        },
        chat(text = "-bag", player = 0) {
            actor = players[player];
            chatText = text;
            assert.ok(chat);
            actions.get(chat)!();
        },
        change(next: InventorySnapshot) {
            snapshot = next;
            for (const listener of listeners) listener();
        },
        stop,
        cleanup() {
            stop();
            for (const [key, descriptor] of saved) {
                if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[key];
                else Object.defineProperty(globalThis, key, descriptor);
            }
        },
    };
}
function withFixture(
    check: (state: ReturnType<typeof fixture>) => void,
    local = 0,
    missing = "",
    toc = true,
): void {
    const state = fixture(local, missing, toc);
    try {
        check(state);
    } finally {
        state.cleanup();
    }
}

test("I4 兩個用戶端建立順序相同，只依本地玩家改變可見性", () => {
    const sequences: unknown[][] = [];
    for (const local of [0, 1])
        withFixture((s) => {
            assert.equal(s.calls.length, 0);
            s.start();
            s.chat();
            s.chat();
            s.chat();
            assert.equal(s.errors.length, 0);
            assert.equal(s.calls.filter((call) => call.name === "loadTOC").length, 1);
            sequences.push(
                s.calls
                    .filter((call) =>
                        ["create", "fromOrigin", "fromName", "setModel"].includes(call.name),
                    )
                    .map((call) => ({
                        name: call.name,
                        args: call.args.map((arg) =>
                            typeof arg === "object" ? (arg as { key?: string })?.key : arg,
                        ),
                    })),
            );
            const root = s.handles.get("ItrInventoryRoot:100");
            assert.ok(
                s.calls.some(
                    (call) =>
                        call.name === "setVisible" &&
                        call.args[0] === root &&
                        call.args[1] === (local === 0),
                ),
            );
            assert.ok(!s.calls.some((call) => call.name === "isVisible"));
        }, local);
    assert.deepEqual(sequences[0], sequences[1]);
});

test("I4 非擁有者不能開關、分頁、選取或丟棄", () =>
    withFixture((s) => {
        s.start();
        const before = s.calls.length;
        s.chat("-bag", 1);
        for (const key of [
            "ItrSlotButton:4",
            "ItrTabButton:401",
            "ItrActionButton:410",
            "ItrActionButton:411",
            "ItrActionButton:420",
        ])
            s.event(key, "click", 1);
        assert.equal(s.sends(), 0);
        assert.equal(s.calls.length, before);
    }));

test("I4 全部格子閉包保留編號，分頁與跨頁交換同步執行", () =>
    withFixture((s) => {
        s.start();
        s.chat();
        s.event("ItrSlotButton:4");
        s.event("ItrTabButton:402");
        s.event("ItrSlotButton:93");
        assert.equal(s.snapshot().bag[0], false);
        assert.notEqual(s.snapshot().bag[89], false);
        assert.equal(s.sends(), 2);
        assert.ok(
            s.calls.some(
                (call) =>
                    call.name === "setVisible" &&
                    call.args[0] === s.handles.get("ItrSlotButton:93") &&
                    call.args[1] === true,
            ),
        );
        s.event("ItrSlotButton:93", "enter");
        assert.ok(
            s.calls.some(
                (call) =>
                    call.name === "setText" && String(call.args[1]).includes("訓練短劍，普通階"),
            ),
        );
        s.event("ItrSlotButton:93", "leave");
        assert.ok(
            String(
                s.calls
                    .filter(
                        (call) =>
                            call.name === "setText" &&
                            call.args[0] === s.handles.get("ItrDescriptionText:104"),
                    )
                    .at(-1)!.args[1],
            ).includes("移入格子"),
        );
    }));

test("I4 操作失敗顯示全部原因並保留選取", () =>
    withFixture((s) => {
        s.start();
        s.chat();
        const bag = [...s.snapshot().bag];
        bag[0] = createItem(1, ItemBaseId.SpellManual, (low) => low);
        s.change({ ...s.snapshot(), bag, hero: { ...runeScholar, knowledge: [] } });
        s.event("ItrSlotButton:4");
        s.event("ItrSlotButton:3");
        const message = String(
            s.calls
                .filter(
                    (call) =>
                        call.name === "setText" &&
                        call.args[0] === s.handles.get("ItrResultText:105"),
                )
                .at(-1)!.args[1],
        );
        assert.ok(message.includes("位置錯誤") && message.includes("缺少知識"));
        assert.equal(
            s.calls
                .filter(
                    (call) =>
                        call.name === "setVisible" &&
                        call.args[0] === s.handles.get("ItrSlotSelection:4"),
                )
                .at(-1)!.args[1],
            true,
        );
    }));

test("I4 外部變更立即更新圖示、說明與數值，並清除舊選取", () =>
    withFixture((s) => {
        s.start();
        s.chat();
        s.event("ItrSlotButton:4");
        s.event("ItrSlotButton:4", "enter");
        const next = [...s.snapshot().bag];
        next[0] = createItem(2, ItemBaseId.ApprenticeRobe, (low) => low);
        s.change({ ...s.snapshot(), bag: next });
        const description = s.calls
            .filter(
                (call) =>
                    call.name === "setText" &&
                    call.args[0] === s.handles.get("ItrDescriptionText:104"),
            )
            .at(-1)!;
        assert.ok(String(description.args[1]).includes("學徒長袍"));
        s.event("ItrSlotButton:2");
        assert.equal(s.snapshot().worn.armor, undefined);
        assert.ok(
            s.calls.some((call) => call.name === "setText" && String(call.args[1]).includes("%")),
        );
    }));

test("I4 英雄預覽只建立一次正面 SPRITE，反覆開關不增加，縮放與位移遵守 I3", () =>
    withFixture((s) => {
        s.start();
        s.chat();
        const first = s.handles.get("ItrModelPreview:500");
        s.event("ItrActionButton:411");
        s.event("ItrActionButton:420");
        s.chat();
        s.chat();
        assert.equal(s.handles.get("ItrModelPreview:500"), first);
        assert.equal(
            s.calls.filter((call) => call.name === "create" && call.args[0] === "ItrModelPreview")
                .length,
            1,
        );
        assert.equal(
            s.calls.filter((call) => call.name === "setModel").at(-1)!.args[1],
            "ui\\itr-hero-preview.mdl",
        );
        assert.deepEqual(
            s.calls
                .filter((call) => call.name === "setSize")
                .at(-1)!
                .args.slice(1),
            [0.001, 0.001],
        );
        assert.equal(s.calls.filter((call) => call.name === "setScale").at(-1)!.args[1], 0.001);
        assert.deepEqual(
            s.calls
                .filter((call) => call.name === "setPoint")
                .at(-1)!
                .args.slice(-2),
            [100, 195],
        );
    }));

test("I4 所有按鈕重設焦點，停止後清理訂閱、觸發器與根框架", () =>
    withFixture((s) => {
        s.start();
        s.chat();
        const buttons = s.events.filter((event) => event.event === "click");
        assert.equal(buttons.length, 100);
        for (const event of buttons) s.event((event.frame as unknown as { key: string }).key);
        assert.equal(s.calls.filter((call) => call.name === "resetFocus").length, buttons.length);
        s.stop();
        s.stop();
        assert.equal(s.actions.size, 0);
        assert.equal(s.timers.size, 0);
        assert.equal(s.listeners.length, 0);
        assert.equal(s.calls.filter((call) => call.name === "destroy").length, 2);
    }));

test("I4 TOC 或樣板失敗使用 logger 並清理部分資源", () => {
    for (const [missing, toc] of [
        ["", false],
        ["ItrSlotButton:4", true],
        ["ItrSlotIcon:4", true],
    ] as const)
        withFixture(
            (s) => {
                s.start();
                assert.equal(s.actions.size, 0);
                assert.equal(s.listeners.length, 0);
                assert.ok(s.errors.length > 0);
            },
            0,
            missing,
            toc,
        );
    withFixture((s) => {
        s.stop();
        assert.equal(s.timers.size, 0);
        assert.equal(s.calls.length, 0);
    });
});
