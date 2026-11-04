import { FileNatives } from "./file-natives";

/** 檔案通道技能由建置流程保留。每個技能只使用第 0 級，不與 i18n 的技能文字共用。 */
export const wc3FileNatives: FileNatives = {
    prepare(abilities) {
        const carrier = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE)!, FourCC("hpea"), 0, 0, 0)!;
        ShowUnit(carrier, false);
        for (const ability of abilities) UnitAddAbility(carrier, FourCC(ability));
        RemoveUnit(carrier);
        for (const ability of abilities) BlzSetAbilityTooltip(FourCC(ability), "ITF-IDLE", 0);
    },
    getTooltip: (ability) => BlzGetAbilityTooltip(FourCC(ability), 0) ?? "",
    setTooltip: (text, ability) => BlzSetAbilityTooltip(FourCC(ability), text, 0),
    clear: () => PreloadGenClear(),
    start: () => PreloadGenStart(),
    emit: (line) => Preload(line),
    finish: (path) => PreloadGenEnd(path),
    load: (path) => Preloader(path),
};
