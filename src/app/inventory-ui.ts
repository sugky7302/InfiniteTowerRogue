import {
    InventoryCell,
    InventoryEvent,
    InventoryPort,
    InventorySelection,
    bagPosition,
    equipmentPosition,
    equipmentSlotNames,
    inventorySlots,
    inventoryDescription,
    inventorySlotView,
    inventoryView,
    previewPath,
    rotatePreview,
} from "@features/equipment";
import { logger } from "@shared/logger";
import { FrameNatives, wc3FrameNatives } from "@shared/wc3-def";

/** 共同流程建立相同框架。只有擁有者的同步事件可以送出操作。 */
export function runInventoryUi(
    port: InventoryPort,
    owner: player,
    frames: FrameNatives = wc3FrameNatives,
): () => void {
    let startup: timer | undefined = CreateTimer();
    let stopped = false;
    let opened = false;
    let page = 0;
    let angle = 0;
    let selection: InventorySelection = false;
    let hovered: InventoryCell | false = false;
    let resultText = "";
    let root: framehandle | undefined;
    let toggle: framehandle | undefined;
    let model: framehandle | undefined;
    let description: framehandle | undefined;
    let result: framehandle | undefined;
    let stopChanges: (() => void) | undefined;
    const triggers: trigger[] = [];
    const cells: {
        cell: InventoryCell;
        button: framehandle;
        icon: framehandle;
        selected: framehandle;
    }[] = [];
    const stats: { name: framehandle; value: framehandle }[] = [];
    const tabs: framehandle[] = [];

    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (startup !== undefined) {
            PauseTimer(startup);
            DestroyTimer(startup);
            startup = undefined;
        }
        stopChanges?.();
        for (const target of triggers) DestroyTrigger(target);
        triggers.length = 0;
        // 父框架會清除全部子框架，包括已隱藏的預覽。
        if (root !== undefined) frames.destroy(root);
        if (toggle !== undefined) frames.destroy(toggle);
    };
    const create = (template: string, parent: framehandle, context: number): framehandle => {
        const handle = frames.create(template, parent, 0, context);
        if (handle === undefined) throw new Error("無法建立物品欄樣板：" + template);
        return handle;
    };
    const child = (name: string, context: number): framehandle => {
        const handle = frames.fromName(name, context);
        if (handle === undefined) throw new Error("物品欄缺少子框架：" + name);
        return handle;
    };
    const place = (handle: framehandle, x: number, y: number): void => {
        frames.clearPoints(handle);
        frames.setAbsPoint(handle, FRAMEPOINT_TOPLEFT, x, y);
    };
    const text = (
        template: string,
        context: number,
        x: number,
        y: number,
        value: string,
    ): framehandle => {
        const handle = create(template, root!, context);
        place(handle, x, y);
        frames.setText(handle, value);
        return handle;
    };
    const listen = (action: (this: void) => void): trigger => {
        const target = CreateTrigger();
        triggers.push(target);
        TriggerAddAction(target, () => {
            if (stopped || GetTriggerPlayer() !== owner) return;
            try {
                action();
            } catch (error) {
                logger.error(error);
            }
        });
        return target;
    };
    const button = (handle: framehandle, action: (this: void) => void): void => {
        const target = listen(() => {
            frames.resetFocus(handle);
            action();
        });
        frames.registerEvent(target, handle, FRAMEEVENT_CONTROL_CLICK);
    };
    const visibility = (): void => {
        if (root !== undefined) frames.setVisible(root, GetLocalPlayer() === owner && opened);
    };
    const preview = (): void => {
        if (model !== undefined) frames.setVisible(model, false);
        model = create("ItrModelPreview", root!, 500);
        frames.setSize(model, 0.001, 0.001);
        frames.setScale(model, 0.001);
        frames.clearPoints(model);
        // setScale 也縮放位移。相對根框架左下角的位移先除以縮放。
        frames.setPoint(
            model,
            FRAMEPOINT_BOTTOMLEFT,
            root!,
            FRAMEPOINT_BOTTOMLEFT,
            0.1 / 0.001,
            0.195 / 0.001,
        );
        frames.setModel(model, previewPath(angle), 0);
        frames.setSpriteAnimate(model, 2, 0);
    };
    const render = (): void => {
        if (root === undefined) return;
        const snapshot = port.read();
        const view = inventoryView(snapshot, page, selection);
        for (const cell of cells) {
            const slot = inventorySlotView(snapshot, cell.cell, selection);
            const visible =
                cell.cell.kind === "equipment" || bagPosition(cell.cell.index).page === page;
            frames.setVisible(cell.button, visible);
            frames.setTexture(cell.icon, slot.icon, 0, true);
            frames.setVisible(cell.selected, slot.selected);
        }
        for (let index = 0; index < stats.length; index++) {
            frames.setText(stats[index].name, view.stats[index].name);
            frames.setText(stats[index].value, view.stats[index].value);
        }
        for (let index = 0; index < tabs.length; index++)
            frames.setText(tabs[index], (page === index ? "● " : "") + "第 " + (index + 1) + " 頁");
        frames.setText(description!, inventoryDescription(snapshot, hovered));
        frames.setText(result!, resultText);
    };
    const send = (event: InventoryEvent): void => {
        if (!opened) return;
        const next = port.send(selection, event);
        selection = next.selection;
        resultText = next.messages.join(" ");
        render();
    };
    const show = (value: boolean): void => {
        opened = value;
        if (opened) {
            // I3 確認：每次顯示必須建立新 SPRITE；不能在原框架換模型。
            angle = 0;
            preview();
            render();
        }
        visibility();
    };
    TimerStart(startup, 0, false, () => {
        if (startup !== undefined) DestroyTimer(startup);
        startup = undefined;
        if (stopped) return;
        try {
            if (!frames.loadTOC("ui\\infinite-tower-rogue.toc"))
                throw new Error("物品欄主 TOC 載入失敗。");
            const origin = frames.fromOrigin(ORIGIN_FRAME_GAME_UI, 0);
            if (origin === undefined) throw new Error("無法取得遊戲框架。");
            root = create("ItrInventoryRoot", origin, 100);
            place(root, 0.02, 0.58);
            frames.setVisible(root, false);
            for (const entry of [
                { template: "ItrHeroPanel", x: 0.02, y: 0.58 },
                { template: "ItrStatsPanel", x: 0.225, y: 0.58 },
                { template: "ItrBagPanel", x: 0.44, y: 0.58 },
                { template: "ItrDescriptionPanel", x: 0.02, y: 0.295 },
            ])
                place(create(entry.template, root, 101), entry.x, entry.y);
            text("ItrSectionTitle", 102, 0.035, 0.568, "英雄與穿戴");
            text("ItrSectionTitle", 103, 0.238, 0.568, "二級數值");
            description = text("ItrDescriptionText", 104, 0.032, 0.283, "");
            result = text("ItrResultText", 105, 0.032, 0.2, "");
            for (let index = 0; index < 94; index++) {
                const id = index;
                const cell: InventoryCell =
                    id < 4
                        ? { kind: "equipment", slot: inventorySlots[id] }
                        : { kind: "bag", index: id - 4 };
                const position = id < 4 ? equipmentPosition(id) : bagPosition(id - 4);
                const handle = create("ItrSlotButton", root, id);
                place(handle, position.x, position.y);
                const icon = child("ItrSlotIcon", id);
                frames.setAllPoints(icon, handle);
                const selected = child("ItrSlotSelection", id);
                cells.push({ cell, button: handle, icon, selected });
                if (cell.kind === "equipment")
                    text(
                        "ItrSlotLabel",
                        200 + id,
                        position.x,
                        position.y + 0.016,
                        equipmentSlotNames[cell.slot],
                    );
                button(handle, () => send({ kind: "click", cell }));
                const hover = listen(() => {
                    if (!opened) return;
                    hovered = frames.getEventType() === FRAMEEVENT_MOUSE_ENTER ? cell : false;
                    render();
                });
                frames.registerEvent(hover, handle, FRAMEEVENT_MOUSE_ENTER);
                frames.registerEvent(hover, handle, FRAMEEVENT_MOUSE_LEAVE);
            }
            for (let index = 0; index < 13; index++) {
                const id = index;
                const handle = create("ItrStatLine", root, 300 + id);
                place(handle, 0.238, 0.544 - id * 0.0175);
                stats.push({
                    name: child("ItrStatName", 300 + id),
                    value: child("ItrStatValue", 300 + id),
                });
            }
            for (let index = 0; index < 3; index++) {
                const id = index;
                const handle = text("ItrTabButton", 400 + id, 0.455 + id * 0.102, 0.573, "");
                tabs.push(handle);
                button(handle, () => {
                    if (!opened) return;
                    page = id;
                    hovered = false;
                    render();
                });
            }
            const drop = text("ItrActionButton", 410, 0.032, 0.337, "丟棄");
            button(drop, () => send({ kind: "drop" }));
            const close = text("ItrActionButton", 411, 0.123, 0.337, "關閉");
            button(close, () => show(false));
            for (const direction of [-1, 1] as const) {
                const turn = direction;
                const handle = text(
                    "ItrTurnButton",
                    412 + (turn === -1 ? 0 : 1),
                    turn === -1 ? 0.076 : 0.122,
                    0.378,
                    turn === -1 ? "左轉" : "右轉",
                );
                button(handle, () => {
                    if (!opened) return;
                    angle = rotatePreview(angle, turn);
                    preview();
                });
            }
            toggle = create("ItrActionButton", origin, 420);
            place(toggle, 0.625, 0.193);
            frames.setText(toggle, "物品欄");
            frames.setVisible(toggle, GetLocalPlayer() === owner);
            button(toggle, () => show(!opened));
            const chat = listen(() => {
                if (GetEventPlayerChatString() === "-bag") show(!opened);
            });
            TriggerRegisterPlayerChatEvent(chat, owner, "-bag", true);
            stopChanges = port.subscribe(() => {
                try {
                    selection = false;
                    resultText = "";
                    render();
                } catch (error) {
                    // 顯示失敗不得中斷已完成的物品或載體變更。
                    logger.error(error);
                }
            });
            render();
            visibility();
        } catch (error) {
            logger.error(error);
            stop();
        }
    });
    return stop;
}
