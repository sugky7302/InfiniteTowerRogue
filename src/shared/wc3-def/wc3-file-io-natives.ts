import { FileIoNatives } from "./file-io-natives";

/** A0IO 由建置流程保留。只使用第 0 級，不與 i18n 的技能文字共用。 */
export const wc3FileIoNatives: FileIoNatives = {
    prepare() {
        const carrier = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE)!, FourCC("hpea"), 0, 0, 0)!;
        ShowUnit(carrier, false);
        UnitAddAbility(carrier, FourCC("A0IO"));
        RemoveUnit(carrier);
        BlzSetAbilityTooltip(FourCC("A0IO"), "ITF-IDLE", 0);
    },
    getTooltip: () => BlzGetAbilityTooltip(FourCC("A0IO"), 0) ?? "",
    setTooltip: (text) => BlzSetAbilityTooltip(FourCC("A0IO"), text, 0),
    clear: () => PreloadGenClear(),
    start: () => PreloadGenStart(),
    emit: (line) => Preload(line),
    finish: (path) => PreloadGenEnd(path),
    load: (path) => Preloader(path),
};
