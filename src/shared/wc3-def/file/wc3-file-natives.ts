import { FileNatives } from "./file-natives";

/** A0IO 由建置流程保留。每個等級保存一段資料，不與 i18n 的技能文字共用。 */
export const wc3FileNatives: FileNatives = {
    prepare() {
        const carrier = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE)!, FourCC("hpea"), 0, 0, 0)!;
        ShowUnit(carrier, false);
        UnitAddAbility(carrier, FourCC("A0IO"));
        RemoveUnit(carrier);
        BlzSetAbilityTooltip(FourCC("A0IO"), "ITF-IDLE", 0);
    },
    getTooltip: (level) => BlzGetAbilityTooltip(FourCC("A0IO"), level) ?? "",
    setTooltip: (text, level) => BlzSetAbilityTooltip(FourCC("A0IO"), text, level),
    clear: () => PreloadGenClear(),
    start: () => PreloadGenStart(),
    emit: (line) => Preload(line),
    finish: (path) => PreloadGenEnd(path),
    load: (path) => Preloader(path),
};
