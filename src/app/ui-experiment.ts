import { logger } from "@shared/logger";
import { FrameNatives, wc3FrameNatives } from "@shared/wc3-def";
import type { HeroExample } from "./hero-example";

/** 暫時的 I3 實驗。傳回停止函式；框架與觸發器都在共同流程建立。 */
export function runUiExperiment(
    hero: Pick<HeroExample, "nativeUnit"> | undefined,
    modelPath: string,
    frames: FrameNatives = wc3FrameNatives,
): () => void {
    const triggers: trigger[] = [];
    const roots: framehandle[] = [];
    const watches = new Map<player, timer>();
    const reports: { name: string; frame: framehandle | undefined }[] = [];
    let startup: timer | undefined = CreateTimer();
    let panel: framehandle | undefined;
    let model: framehandle | undefined;
    let origin: framehandle | undefined;
    let probe: framehandle | undefined;
    let mainLoaded = false;
    let probeLoaded = false;
    let attempted = false;
    let stopped = false;
    let modelX = 0.34;
    let modelY = 0.06;
    let modelScale = 0.001;

    const tell = (target: player, text: string): void => {
        DisplayTimedTextToPlayer(target, 0, 0, 15, text);
    };
    const error = (target: player, text: string): void => {
        // logger 沒有玩家參數。錯誤只在事件玩家的用戶端輸出。
        if (GetLocalPlayer() === target) logger.error(text);
    };
    const cancelWatch = (target: player): void => {
        const watch = watches.get(target);
        if (watch !== undefined) {
            PauseTimer(watch);
            DestroyTimer(watch);
            watches.delete(target);
        }
    };
    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (startup !== undefined) {
            PauseTimer(startup);
            DestroyTimer(startup);
            startup = undefined;
        }
        for (const watch of watches.values()) {
            PauseTimer(watch);
            DestroyTimer(watch);
        }
        watches.clear();
        for (const target of triggers) DestroyTrigger(target);
        triggers.length = 0;
        // 銷毀父框架會清除子框架。不要再逐一銷毀子框架。
        for (const root of roots) {
            try {
                frames.setVisible(root, false);
                frames.destroy(root);
            } catch (caught) {
                logger.error("I3 根框架銷毀失敗；已嘗試隱藏。");
                logger.error(caught);
            }
        }
        roots.length = 0;
    };
    const listen = (action: (this: void) => void): trigger => {
        const target = CreateTrigger();
        triggers.push(target);
        TriggerAddAction(target, () => {
            try {
                action();
            } catch (caught) {
                if (GetLocalPlayer() === GetTriggerPlayer()) {
                    logger.error("I3 事件執行失敗。");
                    logger.error(caught);
                }
            }
        });
        return target;
    };
    const create = (
        name: string,
        parent: framehandle,
        context: number,
    ): framehandle | undefined => {
        const result = frames.create(name, parent, 0, context);
        reports.push({ name: name + "（" + context + "）", frame: result });
        return result;
    };
    const child = (name: string, context: number): framehandle | undefined => {
        const result = frames.fromName(name, context);
        reports.push({ name: name + "（" + context + "）", frame: result });
        return result;
    };
    const place = (frame: framehandle | undefined, x: number, y: number): void => {
        if (frame === undefined || panel === undefined) return;
        frames.clearPoints(frame);
        frames.setPoint(frame, FRAMEPOINT_TOPLEFT, panel, FRAMEPOINT_TOPLEFT, x, y);
    };
    const placeModel = (): void => {
        if (model === undefined || panel === undefined) return;
        frames.clearPoints(model);
        frames.setPoint(model, FRAMEPOINT_BOTTOMLEFT, panel, FRAMEPOINT_BOTTOMLEFT, modelX, modelY);
        frames.setScale(model, modelScale);
    };
    const button = (frame: framehandle, name: string, slot?: number): void => {
        const target = listen(() => {
            const player = GetTriggerPlayer()!;
            const kind = frames.getEventType();
            if (kind === FRAMEEVENT_CONTROL_CLICK) {
                frames.resetFocus(frame);
                tell(player, "已點擊：" + name);
            } else if (kind === FRAMEEVENT_MOUSE_ENTER) {
                tell(player, "滑鼠移入格子：" + slot);
            } else if (kind === FRAMEEVENT_MOUSE_LEAVE) {
                tell(player, "滑鼠移出格子：" + slot);
            }
        });
        frames.registerEvent(target, frame, FRAMEEVENT_CONTROL_CLICK);
        if (slot !== undefined) {
            frames.registerEvent(target, frame, FRAMEEVENT_MOUSE_ENTER);
            frames.registerEvent(target, frame, FRAMEEVENT_MOUSE_LEAVE);
        }
    };
    const buildPanel = (): void => {
        if (attempted || origin === undefined || !mainLoaded) return;
        attempted = true;
        panel = create("ItrPanel", origin, 100);
        if (panel === undefined) return;
        roots.push(panel);
        frames.setVisible(panel, false);
        frames.clearPoints(panel);
        frames.setAbsPoint(panel, FRAMEPOINT_CENTER, 0.4, 0.36);
        const title = create("ItrTitleText", panel, 101);
        place(title, 0.025, -0.02);
        if (title !== undefined) frames.setText(title, "物品欄實驗");
        const body = create("ItrBodyText", panel, 102);
        place(body, 0.025, -0.055);
        if (body !== undefined) frames.setText(body, "中文字型測試：Inventory ABC 123。");
        for (let index = 1; index <= 3; index++) {
            const id = index;
            const slot = create("ItrSlotButton", panel, id);
            place(slot, 0.025 + (id - 1) * 0.05, -0.105);
            if (slot === undefined) continue;
            const icon = child("ItrSlotIcon", id);
            if (icon !== undefined) {
                frames.setAllPoints(icon, slot);
                frames.setTexture(
                    icon,
                    "ReplaceableTextures\\CommandButtons\\BTNSteelMelee.blp",
                    0,
                    true,
                );
            }
            const selection = child("ItrSlotSelection", id);
            if (selection !== undefined) frames.setVisible(selection, false);
            button(slot, "格子 " + id, id);
        }
        const tab = create("ItrTabButton", panel, 200);
        place(tab, 0.025, -0.16);
        if (tab !== undefined) {
            frames.setText(tab, "第 1 頁");
            button(tab, "第 1 頁");
        }
        const action = create("ItrActionButton", panel, 201);
        place(action, 0.13, -0.16);
        if (action !== undefined) {
            frames.setText(action, "丟棄");
            button(action, "丟棄");
        }
        const stats = [
            { name: "最大生命", value: "120" },
            { name: "攻擊速度", value: "15%" },
        ];
        for (let index = 0; index < stats.length; index++) {
            const context = 300 + index;
            const stat = stats[index];
            const line = create("ItrStatLine", panel, context);
            place(line, 0.025, -0.215 - index * 0.03);
            if (line === undefined) continue;
            const name = child("ItrStatName", context);
            const value = child("ItrStatValue", context);
            if (name !== undefined) frames.setText(name, stat.name);
            if (value !== undefined) frames.setText(value, stat.value);
        }
        model = create("ItrModelPreview", panel, 400);
        if (model !== undefined) {
            placeModel();
            if (hero !== undefined && modelPath.length > 0) {
                frames.setModel(model, modelPath, 0);
                frames.setSpriteAnimate(model, 2, 0);
            }
        }
    };
    const visibleText = (): string =>
        panel === undefined ? "未建立" : frames.isVisible(panel) ? "可見" : "隱藏";
    const command = (): void => {
        const player = GetTriggerPlayer()!;
        const parts = (GetEventPlayerChatString() ?? "")
            .trim()
            .split(" ")
            .filter((part) => part.length > 0);
        switch (parts[0]) {
            case "-ui-toc":
                tell(
                    player,
                    "主 TOC loadTOC：" +
                        mainLoaded +
                        "；探測 TOC loadTOC：" +
                        probeLoaded +
                        "；ItrProbeText：" +
                        (probe !== undefined ? "建立成功" : "建立失敗") +
                        "。",
                );
                return;
            case "-ui-show":
                buildPanel();
                if (!mainLoaded) error(player, "主 TOC 載入失敗，不能建立面板。");
                for (const report of reports) {
                    if (report.frame === undefined) error(player, report.name + "：建立失敗。");
                    else tell(player, report.name + "：建立成功。");
                }
                if (panel !== undefined && GetLocalPlayer() === player)
                    frames.setVisible(panel, true);
                if (hero === undefined || modelPath.length === 0)
                    error(player, "英雄或模型路徑不存在，不能設定模型。");
                tell(
                    player,
                    "模型來源：" +
                        modelPath +
                        "。位置 " +
                        modelX +
                        "、" +
                        modelY +
                        "；縮放 " +
                        modelScale +
                        "。",
                );
                return;
            case "-ui-hide":
                if (panel !== undefined && GetLocalPlayer() === player)
                    frames.setVisible(panel, false);
                tell(player, "已隱藏實驗面板。");
                return;
            case "-ui-model": {
                const x = Number(parts[1]),
                    y = Number(parts[2]),
                    scale = Number(parts[3]);
                if (
                    parts.length !== 4 ||
                    !Number.isFinite(x) ||
                    !Number.isFinite(y) ||
                    !Number.isFinite(scale) ||
                    x < -0.8 ||
                    x > 0.8 ||
                    y < -0.6 ||
                    y > 0.6 ||
                    scale <= 0 ||
                    scale > 5
                ) {
                    error(
                        player,
                        "用法：-ui-model <x> <y> <scale>。x：-0.8～0.8；y：-0.6～0.6；scale：大於 0 且不超過 5。",
                    );
                    return;
                }
                if (model === undefined) {
                    error(player, "請先用 -ui-show 建立模型框架。");
                    return;
                }
                modelX = x;
                modelY = y;
                modelScale = scale;
                placeModel();
                tell(
                    player,
                    "模型相對面板左下角：" + modelX + "、" + modelY + "；縮放 " + modelScale + "。",
                );
                return;
            }
            case "-ui-anim": {
                if (model === undefined) {
                    error(player, "請先用 -ui-show 建立模型框架。");
                    return;
                }
                const name = parts[1];
                // SPRITE 的主要屬性不同於 ANIM_TYPE_* 的 handle 編號。
                const animations: Record<string, number | undefined> = {
                    birth: 0,
                    death: 1,
                    stand: 2,
                    morph: 3,
                    alternate: 4,
                };
                const primary = animations[name];
                if (parts.length !== 2 || typeof primary !== "number") {
                    error(
                        player,
                        "SPRITE 沒有可用的 attack 屬性，也不能按任意名稱播放。用法：-ui-anim <stand|birth|death|morph|alternate>。",
                    );
                    return;
                }
                frames.setSpriteAnimate(model, primary, 0);
                tell(
                    player,
                    "w3ts 不支援按名稱播放；" +
                        name +
                        " 使用主要動作屬性 " +
                        primary +
                        "，旗標 0。",
                );
                return;
            }
            case "-ui-select": {
                cancelWatch(player);
                const watch = CreateTimer();
                watches.set(player, watch);
                TimerStart(watch, 10, false, () => {
                    tell(player, "選取觀察結束。面板：" + visibleText() + "。");
                    cancelWatch(player);
                });
                tell(
                    player,
                    "開始觀察選取變化，持續 10 秒。面板：" +
                        visibleText() +
                        "。請選取英雄與其他單位。",
                );
                return;
            }
            case "-ui-stop":
                stop();
                tell(player, "已停止 I3 實驗，並清理框架、觸發器與計時器。");
                return;
        }
    };

    TimerStart(startup, 0, false, () => {
        DestroyTimer(startup!);
        startup = undefined;
        try {
            mainLoaded = frames.loadTOC("ui\\infinite-tower-rogue.toc");
            probeLoaded = frames.loadTOC("ui\\itr-probe-no-trailing.toc");
            if (!mainLoaded) logger.error("I3 主 TOC 載入失敗。");
            if (!probeLoaded) logger.error("I3 探測 TOC 傳回 false。");
            origin = frames.fromOrigin(ORIGIN_FRAME_GAME_UI, 0);
            if (origin === undefined) throw new Error("I3 無法取得遊戲原點框架。");
            probe = frames.create("ItrProbeText", origin, 0, 500);
            if (probe !== undefined) {
                roots.push(probe);
                frames.setVisible(probe, false);
            }
            const chat = listen(command);
            const selection = listen(() => {
                const player = GetTriggerPlayer()!;
                if (!watches.has(player)) return;
                const unit = GetTriggerUnit()!;
                const action =
                    GetTriggerEventId() === EVENT_PLAYER_UNIT_SELECTED ? "選取" : "取消選取";
                tell(
                    player,
                    action +
                        "：" +
                        GetUnitName(unit) +
                        "（" +
                        (hero !== undefined && unit === hero.nativeUnit ? "英雄" : "其他單位") +
                        "）。面板：" +
                        visibleText() +
                        "。",
                );
            });
            for (let index = 0; index < bj_MAX_PLAYER_SLOTS; index++) {
                const player = Player(index)!;
                TriggerRegisterPlayerChatEvent(chat, player, "-ui-", false);
                TriggerRegisterPlayerUnitEvent(
                    selection,
                    player,
                    EVENT_PLAYER_UNIT_SELECTED,
                    undefined,
                );
                TriggerRegisterPlayerUnitEvent(
                    selection,
                    player,
                    EVENT_PLAYER_UNIT_DESELECTED,
                    undefined,
                );
            }
            logger.info(
                "I3 框架實驗已啟動。指令：-ui-toc、-ui-show、-ui-hide、-ui-model <x> <y> <scale>、-ui-anim <stand|birth|death|morph|alternate>、-ui-select、-ui-stop。",
            );
        } catch (caught) {
            logger.error(caught);
            stop();
        }
    });
    return stop;
}
