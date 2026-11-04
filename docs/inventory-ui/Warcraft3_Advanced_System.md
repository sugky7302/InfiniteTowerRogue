# Warcraft III: Reforged 高階自訂系統開發手冊 (TSTL + W3TS)

本手冊包含針對《魔獸爭霸III：重製版》自訂背包系統、魔獸世界風格三系天賦樹、FDF 邊框渲染模板，以及多人連線安全（Desync-Free）的本地硬碟存讀檔（Save/Load）系統的完整實作程式碼。

---

## 目錄結構建議
為了讓 TSTL (TypeScript To Lua) 專案保持清晰，建議採用以下模組化目錄配置：
```text
src/
├── main.ts                     # 遊戲入口
├── inventory/
│   ├── InventoryManager.ts     # 背包內存狀態資料庫
│   ├── ItemUseSystem.ts        # 物品模擬使用串接
│   └── PickupIntercepter.ts    # 物品地圖拾取攔截
├── ui/
│   ├── InventoryUI.ts          # 背包介面控制器
│   ├── TalentTreeUI.ts         # 三系天賦樹介面控制器
│   ├── TooltipManager.ts       # 浮動詳細提示視窗
│   └── AlertBox.ts             # 螢幕中央警告提示框
└── systems/
    └── SaveLoadSystem.ts       # 本地硬碟存讀檔與全網同步系統
```

---

## 1. 核心背包與攔截使用系統

### 1.1 背包內存資料庫 (`InventoryManager.ts`)
```typescript
import { Item, MapPlayer } from "w3ts";

export interface InventoryItem {
    itemHandle: Item;
    name: string;
    icon: string;
    slotType?: "weapon" | "armor" | "none"; 
}

export class InventoryManager {
    private static playerInventories: Map<number, (InventoryItem | null)[]> = new Map();
    private static playerSelectedSlot: Map<number, number> = new Map();

    public static initPlayer(player: MapPlayer) {
        const id = player.id;
        this.playerInventories.set(id, new Array(30).fill(null));
        this.playerSelectedSlot.set(id, -1);
    }

    public static getInventory(player: MapPlayer): (InventoryItem | null)[] {
        return this.playerInventories.get(player.id) || [];
    }

    public static handleSlotClick(player: MapPlayer, clickedSlot: number): boolean {
        const id = player.id;
        const inv = this.getInventory(player);
        const selected = this.playerSelectedSlot.get(id) ?? -1;

        if (selected === -1) {
            if (inv[clickedSlot] !== null) {
                this.playerSelectedSlot.set(id, clickedSlot);
                return true;
            }
            return false;
        }

        if (selected === clickedSlot) {
            this.playerSelectedSlot.set(id, -1);
            return true;
        }

        const temp = inv[selected];
        inv[selected] = inv[clickedSlot];
        inv[clickedSlot] = temp;
        this.playerSelectedSlot.set(id, -1);
        return true;
    }

    public static addItem(player: MapPlayer, item: Item, slotIndex: number): boolean {
        const inv = this.getInventory(player);
        if (slotIndex >= 0 && slotIndex < inv.length && inv[slotIndex] === null) {
            const iconPath = BlzGetItemAbilityResponseStringField(item.handle, ITEM_SF_ICON_ANIMATED);
            inv[slotIndex] = {
                itemHandle: item,
                name: item.name,
                icon: iconPath,
                slotType: "none"
            };
            return true;
        }
        return false;
    }
}
```

### 1.2 物品拾取攔截器 (`PickupIntercepter.ts`)
```typescript
import { Trigger, Unit, Item, MapPlayer } from "w3ts";
import { InventoryManager } from "./InventoryManager";
import { AlertBox } from "../ui/AlertBox";

export class PickupIntercepter {
    private static trigger: Trigger;

    public static init() {
        this.trigger = Trigger.create();
        this.trigger.registerAnyUnitEvent(EVENT_PLAYER_UNIT_PICKUP_ITEM);
        this.trigger.addAction(() => {
            const u = Unit.fromHandle(GetTriggerUnit());
            const i = Item.fromHandle(GetManipulatedItem());
            
            if (u.isHero()) {
                const owner = u.owner;
                const inv = InventoryManager.getInventory(owner);
                const freeSlot = this.findFreeCustomSlot(inv);

                if (freeSlot !== -1) {
                    UnitRemoveItem(u.handle, i.handle);
                    i.visible = false;
                    InventoryManager.addItem(owner, i, freeSlot);

                    if (GetLocalPlayer() === owner.handle) {
                        StartSound(bj_elevatorMotorSound);
                    }
                    DestroyEffect(AddSpecialEffectTarget("Abilities\Spells\Items\AIam\AIamTarget.mdl", u.handle, "origin"));
                } else {
                    AlertBox.show(owner, "⚠️ 背包已滿！無法撿取物品。");
                }
            }
        });
    }

    private static findFreeCustomSlot(inv: any[]): number {
        for (let i = 0; i < inv.length; i++) {
            if (inv[i] === null) return i;
        }
        return -1;
    }
}
```

### 1.3 模擬物品使用與原生物資串接 (`ItemUseSystem.ts`)
```typescript
import { Item, Unit, MapPlayer } from "w3ts";
import { InventoryItem } from "./InventoryManager";

export class ItemUseSystem {
    public static useItemBySlot(player: MapPlayer, hero: Unit, slotIndex: number, inv: (InventoryItem | null)[]) {
        const targetItemData = inv[slotIndex];
        if (!targetItemData) return;

        const itemHandle = targetItemData.itemHandle;

        if (BlzGetItemCooldownRemaining(itemHandle.handle) > 0) {
            print("[系統] 物品正在冷卻中！");
            return;
        }

        const originalNativeItem = UnitItemInSlot(hero.handle, 0);
        if (originalNativeItem) {
            UnitRemoveItem(hero.handle, originalNativeItem);
        }

        UnitAddItem(hero.handle, itemHandle.handle);
        IssueImmediateOrderById(hero.handle, 852002); // 模擬點擊原生第 1 格使用物品

        if (!itemHandle.isOwned()) {
            inv[slotIndex] = null;
        } else {
            UnitRemoveItem(hero.handle, itemHandle.handle);
        }

        if (originalNativeItem) {
            UnitAddItem(hero.handle, originalNativeItem);
        }
    }
}
```

---

## 2. 經典三系天賦樹介面核心系統 (`TalentTreeUI.ts`)

```typescript
import { Frame, Trigger, MapPlayer, Unit } from "w3ts";

interface TalentNodeConfig {
    name: string;
    icon: string;
    tabIndex: number;    // 0 = 奧術, 1 = 火焰, 2 = 冰霜
    row: number;         // 0 - 6
    col: number;         // 0 - 3
    maxLevel: number;
    abilityId: number;   
    requiredPoints: number; 
    prerequisite?: number;  
    description: string;
}

export class AdvancedTalentTreeUI {
    private mainFrame!: Frame;
    private tabFrames: Frame = [];
    private nodeButtons: Frame = [];
    
    private infoPanel!: Frame;
    private pointsText!: Frame;
    private specBuildText!: Frame;
    private detailTitleText!: Frame;
    private detailDescText!: Frame;
    private resetButton!: Frame;

    public playerTalentLevels: Map<number, number[]> = new Map();
    public playerTabSpentPoints: Map<number, number[]> = new Map();
    public playerUnspentPoints: Map<number, number> = new Map();

    public talentConfigs: TalentNodeConfig[] = [
        { name: "奧術專注", icon: "ReplaceableTextures\\CommandButtons\\BTNArcaneConcentration.blp", tabIndex: 0, row: 0, col: 1, maxLevel: 5, abilityId: FourCC("A00A"), requiredPoints: 0, description: "使你有傷害性的法術有 2/4/6/8/10% 的機率進入節能施法狀態。" },
        { name: "奧術精妙", icon: "ReplaceableTextures\\CommandButtons\\BTNArcaneSubtlety.blp", tabIndex: 0, row: 0, col: 2, maxLevel: 5, abilityId: FourCC("A00B"), requiredPoints: 0, description: "使你的幸運提高 8/16/24/32/40%。" },
        { name: "氣定神閒", icon: "ReplaceableTextures\\CommandButtons\\BTHPresenceOfMind.blp", tabIndex: 0, row: 2, col: 2, maxLevel: 1, abilityId: FourCC("A00C"), requiredPoints: 10, prerequisite: 1, description: "啟用之後，你的下一個法術將變為瞬發。" }
    ];

    constructor() {
        const gameUI = Frame.fromOrigin(ORIGIN_FRAME_GAME_UI, 0);

        this.mainFrame = Frame.create("AdvancedTalentMain", gameUI, 0, 0, "BACKDROP", "");
        this.mainFrame.setSize(0.65, 0.45); 
        this.mainFrame.setPoint(FRAMEPOINT_CENTER, gameUI, FRAMEPOINT_CENTER, 0, 0);
        this.mainFrame.setTexture("ui\\widgets\\battle.net\\bnet-mainmenu-background.blp", 0, true);
        this.mainFrame.setVisible(false);

        const tabWidth = 0.14;
        const tabHeight = 0.40;
        for (let i = 0; i < 3; i++) {
            const tab = Frame.create(`TalentTab_${i}`, this.mainFrame, 0, 0, "BACKDROP", "");
            tab.setSize(tabWidth, tabHeight);
            tab.setPoint(FRAMEPOINT_TOPLEFT, this.mainFrame, FRAMEPOINT_TOPLEFT, 0.02 + i * (tabWidth + 0.01), -0.03);
            tab.setTexture("ReplaceableTextures\\TeamColor\\TeamColor05.blp", 0, true);
            this.tabFrames.push(tab);
        }

        this.initRightInfoPanel();
        this.renderTalentNodes();
    }

    private initRightInfoPanel() {
        this.infoPanel = Frame.create("TalentInfoPanel", this.mainFrame, 0, 0, "BACKDROP", "");
        this.infoPanel.setSize(0.16, 0.40);
        this.infoPanel.setPoint(FRAMEPOINT_TOPRIGHT, this.mainFrame, FRAMEPOINT_TOPRIGHT, -0.02, -0.03);
        this.infoPanel.setTexture("ui\\widgets\\battle.net\\bnet-inputbox-background.blp", 0, true);

        this.specBuildText = Frame.create("TalentSpecBuild", this.infoPanel, 0, 0, "TEXT", "");
        this.specBuildText.setPoint(FRAMEPOINT_TOP, this.infoPanel, FRAMEPOINT_TOP, 0, -0.02);
        this.specBuildText.setSize(0.14, 0.02);
        BlzFrameSetTextAlignment(this.specBuildText.handle, TEXT_JUSTIFY_CENTER, TEXT_JUSTIFY_MIDDLE);

        this.pointsText = Frame.create("TalentPointsLeft", this.infoPanel, 0, 0, "TEXT", "");
        this.pointsText.setPoint(FRAMEPOINT_TOP, this.specBuildText, FRAMEPOINT_BOTTOM, 0, -0.01);
        this.pointsText.setSize(0.14, 0.03);
        BlzFrameSetTextAlignment(this.pointsText.handle, TEXT_JUSTIFY_CENTER, TEXT_JUSTIFY_MIDDLE);

        this.resetButton = Frame.create("TalentResetBtn", this.infoPanel, 0, 0, "GLUEBUTTON", "ScriptDialogButton");
        this.resetButton.setSize(0.08, 0.025);
        this.resetButton.setPoint(FRAMEPOINT_TOP, this.pointsText, FRAMEPOINT_BOTTOM, 0, -0.01);
        this.resetButton.setText("重置天賦");

        const tReset = Trigger.create();
        tReset.registerFrameEvent(this.resetButton, FRAMEEVENT_CONTROL_CLICK);
        tReset.addAction(() => this.onResetClick());

        this.detailTitleText = Frame.create("TalentDetailTitle", this.infoPanel, 0, 0, "TEXT", "");
        this.detailTitleText.setPoint(FRAMEPOINT_TOPLEFT, this.resetButton, FRAMEPOINT_BOTTOMLEFT, -0.03, -0.03);
        this.detailTitleText.setSize(0.14, 0.02);
        this.detailTitleText.setText("|cffffcc00請選擇天賦|r");

        this.detailDescText = Frame.create("TalentDetailDesc", this.infoPanel, 0, 0, "TEXT", "");
        this.detailDescText.setPoint(FRAMEPOINT_TOPLEFT, this.detailTitleText, FRAMEPOINT_BOTTOMLEFT, 0, -0.005);
        this.detailDescText.setSize(0.14, 0.15);
        this.detailDescText.setText("將滑鼠移至任意天賦圖示上以檢視詳細說明。");
    }

    private renderTalentNodes() {
        const btnSize = 0.028;
        const colSpacing = 0.032;
        const rowSpacing = 0.055;

        this.talentConfigs.forEach((config, index) => {
            const parentTab = this.tabFrames[config.tabIndex];
            const btn = Frame.create(`TalentBtn_${index}`, parentTab, 0, 0, "GLUEBUTTON", "GoldTalentButtonTemplate");
            btn.setSize(btnSize, btnSize);
            
            const posX = 0.012 + config.col * colSpacing;
            const posY = -0.04 - config.row * rowSpacing;
            btn.setPoint(FRAMEPOINT_TOPLEFT, parentTab, FRAMEPOINT_TOPLEFT, posX, posY);
            btn.setTexture(config.icon, 0, true);

            const tClick = Trigger.create();
            tClick.registerFrameEvent(btn, FRAMEEVENT_CONTROL_CLICK);
            tClick.addAction(() => this.onNodeClick(index));

            const tHover = Trigger.create();
            tHover.registerFrameEvent(btn, FRAMEEVENT_MOUSE_ENTER);
            tHover.addAction(() => this.updateDetailPanel(index));

            this.nodeButtons.push(btn);
        });
    }

    public initPlayer(player: MapPlayer, startingPoints: number) {
        const id = player.id;
        this.playerTalentLevels.set(id, new Array(this.talentConfigs.length).fill(0));
        this.playerTabSpentPoints.set(id, [0, 0, 0]);
        this.playerUnspentPoints.set(id, startingPoints);
    }

    private updateDetailPanel(index: number) {
        const player = MapPlayer.fromEvent();
        if (GetLocalPlayer() !== player.handle) return;
        const config = this.talentConfigs[index];
        const levels = this.playerTalentLevels.get(player.id)!;
        this.detailTitleText.setText(`|cffffcc00${config.name}|r\n等級 ${levels[index]}/${config.maxLevel}`);
        this.detailDescText.setText(config.description);
    }

    private onResetClick() {
        const player = MapPlayer.fromEvent();
        const id = player.id;
        const heroHandle = BlzGetTriggerPlayerHero(player.handle);
        if (!heroHandle) return;

        const hero = Unit.fromHandle(heroHandle);
        const levels = this.playerTalentLevels.get(id)!;
        let recoveredPoints = 0;

        this.talentConfigs.forEach((config, index) => {
            if (levels[index] > 0) {
                recoveredPoints += levels[index];
                hero.removeAbility(config.abilityId);
                levels[index] = 0;
            }
        });

        const currentUnspent = this.playerUnspentPoints.get(id)!;
        this.playerUnspentPoints.set(id, currentUnspent + recoveredPoints);
        this.playerTabSpentPoints.set(id, [0, 0, 0]);

        this.refreshUI(player);
    }

    private onNodeClick(index: number) {
        const player = MapPlayer.fromEvent();
        const id = player.id;
        const heroHandle = BlzGetTriggerPlayerHero(player.handle);
        if (!heroHandle) return;

        const hero = Unit.fromHandle(heroHandle);
        const config = this.talentConfigs[index];
        const levels = this.playerTalentLevels.get(id)!;
        const tabSpent = this.playerTabSpentPoints.get(id)!;
        let unspent = this.playerUnspentPoints.get(id)!;

        if (unspent <= 0 || levels[index] >= config.maxLevel || tabSpent[config.tabIndex] < config.requiredPoints) return;

        if (config.prerequisite !== undefined && levels[config.prerequisite] < this.talentConfigs[config.prerequisite].maxLevel) return;

        levels[index]++;
        tabSpent[config.tabIndex]++;
        unspent--;
        this.playerUnspentPoints.set(id, unspent);

        if (levels[index] === 1) {
            hero.addAbility(config.abilityId);
        } else {
            SetUnitAbilityLevel(hero.handle, config.abilityId, levels[index]);
        }

        this.refreshUI(player);
        this.updateDetailPanel(index);
    }

    public refreshUI(player: MapPlayer) {
        if (GetLocalPlayer() !== player.handle) return;
        const id = player.id;
        const levels = this.playerTalentLevels.get(id)!;
        const tabSpent = this.playerTabSpentPoints.get(id)!;
        const unspent = this.playerUnspentPoints.get(id)!;

        this.specBuildText.setText(`|cffffffff天賦方案：|r |cff00ff00${tabSpent[0]} / ${tabSpent[1]} / ${tabSpent[2]}|r`);
        this.pointsText.setText(`|cffffffff可用天賦點數|r\n|cffbbff00${unspent}|r`);

        this.talentConfigs.forEach((config, index) => {
            const btn = this.nodeButtons[index];
            if (levels[index] > 0) {
                btn.setTexture(config.icon, 0, true);
            } else {
                const disIcon = config.icon.replace("CommandButtons\\BTN", "CommandButtonsDisabled\\DISBTN");
                btn.setTexture(disIcon, 0, true);
            }
        });
    }

    public toggle(player: MapPlayer) {
        if (player.handle === GetLocalPlayer()) {
            const visible = this.mainFrame.getVisible();
            this.mainFrame.setVisible(!visible);
            if (!visible) this.refreshUI(player);
        }
    }
}
```

---

## 3. 本地硬碟存讀檔與全網同步系統 (`SaveLoadSystem.ts`)

```typescript
import { MapPlayer, Trigger } from "w3ts";
import { InventoryManager } from "../inventory/InventoryManager";
import { AdvancedTalentTreeUI } from "../ui/TalentTreeUI";

export class SaveLoadSystem {
    private static readonly FILE_PATH = "ForsakenKingdom_Save_";
    private static talentTreeInstance: AdvancedTalentTreeUI;

    public static setTalentTreeInstance(instance: AdvancedTalentTreeUI) {
        this.talentTreeInstance = instance;
    }

    public static saveGame(player: MapPlayer) {
        if (GetLocalPlayer() !== player.handle) return;

        const id = player.id;
        const invData = InventoryManager.getInventory(player);
        const invSavedIds: number[] = [];
        for (let i = 0; i < 30; i++) {
            const item = invData[i];
            invSavedIds.push(item ? GetItemTypeId(item.itemHandle.handle) : 0);
        }

        const talentLevels = this.talentTreeInstance.playerTalentLevels.get(id) || [];
        const unspentPoints = this.talentTreeInstance.playerUnspentPoints.get(id) || 0;

        const saveDataObject = {
            inventory: invSavedIds,
            talents: talentLevels,
            points: unspentPoints
        };
        const rawJson = JSON.stringify(saveDataObject);

        PreloadGenClear();
        Preload(`"])\ncall BlzSetAbilityExtendedTooltip('A000', "${rawJson}", 0)\n//`);
        PreloadGenStart(`${this.FILE_PATH}${player.name}.txt`);
        print(`[存檔] 成功儲存進度至本地硬碟。`);
    }

    public static loadGame(player: MapPlayer) {
        if (GetLocalPlayer() === player.handle) {
            MergeLocalAndDataDelta(`${this.FILE_PATH}${player.name}.txt`, "");
            const loadedDataStr = BlzGetAbilityExtendedTooltip('A000', 0);
            BlzSendSyncPtr(ConvertStringToTriggerString(loadedDataStr));
        }
    }

    public static initSyncListener() {
        const t = Trigger.create();
        for (let i = 0; i < bj_MAX_PLAYERS; i++) {
            BlzTriggerRegisterPlayerSyncEvent(t.handle, Player(i), "SAVE_DATA_SYNC", false);
        }

        t.addAction(() => {
            const syncPlayer = MapPlayer.fromHandle(GetTriggerPlayer());
            const syncDataStr = BlzGetTriggerPlayerSyncString();

            try {
                const saveData = JSON.parse(syncDataStr);
                this.applyLoadedData(syncPlayer, saveData);
            } catch (e) {
                if (GetLocalPlayer() === syncPlayer.handle) {
                    print("|cffff0000[讀檔] 讀取本地存檔失敗，檔案不存在或損壞。|r");
                }
            }
        });
    }

    private static applyLoadedData(player: MapPlayer, data: any) {
        const id = player.id;
        const heroHandle = BlzGetTriggerPlayerHero(player.handle);
        if (!heroHandle) return;

        this.talentTreeInstance.playerTalentLevels.set(id, data.talents);
        this.talentTreeInstance.playerUnspentPoints.set(id, data.points);

        const tabSpent = [0, 0, 0];
        const configs = this.talentTreeInstance.talentConfigs;
        
        data.talents.forEach((lvl: number, index: number) => {
            const config = configs[index];
            if (lvl > 0) {
                tabSpent[config.tabIndex] += lvl;
                SetUnitAbilityLevel(heroHandle, config.abilityId, lvl);
            }
        });
        this.talentTreeInstance.playerTabSpentPoints.set(id, tabSpent);

        const inv = InventoryManager.getInventory(player);
        inv.fill(null);
        
        data.inventory.forEach((itemTypeId: number, index: number) => {
            if (itemTypeId !== 0) {
                const newItem = CreateItem(itemTypeId, 0, 0);
                SetItemVisible(newItem, false);
                const iconPath = BlzGetItemAbilityResponseStringField(newItem, ITEM_SF_ICON_ANIMATED);
                inv[index] = {
                    itemHandle: { handle: newItem } as any,
                    name: GetItemName(newItem),
                    icon: iconPath,
                    slotType: "none"
                };
            }
        });

        this.talentTreeInstance.refreshUI(player);
    }
}
```

---

## 4. UI 邊框與提示輔助元件

### 4.1 核心 FDF 金色外框與發光模板 (`GoldTalentButton.fdf`)
請將此內容匯入地圖中，路徑設為 `ui\GoldTalentButton.fdf`。
```fdf
Frame "GLUEBUTTON" "GoldTalentButtonTemplate" {
    Height 0.028,
    Width 0.028,
    ControlStyle "AUTOTRACK|HIGHLIGHTONMOUSEOVER",

    ControlBackdrop "TalentButtonBackdrop",
    Frame "BACKDROP" "TalentButtonBackdrop" {
        BackdropBackground "ReplaceableTextures\PassiveButtons\PASBTNAnvil.blp",
        BackdropCornerFlags "UL|UR|BL|BR|T|B|L|R",
        BackdropCornerSize 0.006,
        BackdropEdgeFile "ui\widgets\glues\loading-border.blp",
        BackdropBlendAll,
    }

    ControlMouseOverHighlight "TalentMouseOverHighlight",
    Frame "BACKDROP" "TalentMouseOverHighlight" {
        BackdropBlendAll,
        BackdropBackground "UI\Widgets\Console\Human\CommandButton\human-activebutton-glow.blp",
    }
}
```

### 4.2 螢幕中央滿包提示框 (`AlertBox.ts`)
```typescript
import { Frame, MapPlayer } from "w3ts";

export class AlertBox {
    private static alertFrame: Frame;
    private static alertText: Frame;
    private static fadeTimer: timer | null = null;

    public static init() {
        const gameUI = Frame.fromOrigin(ORIGIN_FRAME_GAME_UI, 0);
        this.alertFrame = Frame.create("CustomAlertPanel", gameUI, 0, 0, "BACKDROP", "");
        this.alertFrame.setSize(0.24, 0.04);
        this.alertFrame.setPoint(FRAMEPOINT_TOP, gameUI, FRAMEPOINT_TOP, 0, -0.15);
        this.alertFrame.setTexture("ReplaceableTextures\TeamColor\TeamColor01.blp", 0, true);
        this.alertFrame.setVisible(false);

        this.alertText = Frame.create("AlertText", this.alertFrame, 0, 0, "TEXT", "");
        this.alertText.setAllPoints(this.alertFrame);
        BlzFrameSetTextAlignment(this.alertText.handle, TEXT_JUSTIFY_CENTER, TEXT_JUSTIFY_MIDDLE);
    }

    public static show(player: MapPlayer, message: string) {
        if (GetLocalPlayer() !== player.handle) return;

        this.alertText.setText(`|cffff0000${message}|r`);
        this.alertFrame.setVisible(true);

        if (this.fadeTimer) DestroyTimer(this.fadeTimer);

        this.fadeTimer = CreateTimer();
        TimerStart(this.fadeTimer, 2.5, false, () => {
            this.alertFrame.setVisible(false);
            if (this.fadeTimer) {
                DestroyTimer(this.fadeTimer);
                this.fadeTimer = null;
            }
        });
    }
}
```
