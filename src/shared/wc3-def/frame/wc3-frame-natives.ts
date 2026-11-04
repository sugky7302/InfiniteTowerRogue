import type { Frame } from "w3ts/handles/frame";
import type { FrameNatives } from "./frame-natives";

// Lua 的模組載入函式。獨立 Lua 驗證不載入 Node 型別。
declare function require(
    this: void,
    name: "w3ts/handles/frame",
): typeof import("w3ts/handles/frame");

// 延後載入，讓 Node 可以匯入公開 API。載入此檔案時不呼叫 WC3 或載入 Lua 套件。
function api(): typeof Frame {
    return (require("w3ts/handles/frame") as typeof import("w3ts/handles/frame")).Frame;
}

function wrap(handle: framehandle): Frame {
    return api().fromHandle(handle)!;
}

export const wc3FrameNatives: FrameNatives = {
    loadTOC: (path) => api().loadTOC(path),
    create(template, parent, priority, context) {
        try {
            return api().create(template, wrap(parent), priority, context)?.handle;
        } catch {
            return undefined;
        }
    },
    createType(name, parent, context, type, inherits) {
        try {
            return api().createType(name, wrap(parent), context, type, inherits)?.handle;
        } catch {
            return undefined;
        }
    },
    fromOrigin: (type, index) => api().fromOrigin(type, index)?.handle,
    fromName: (name, context) => api().fromName(name, context)?.handle,
    getChild: (frame, index) => wrap(frame).getChild(index)?.handle,
    fromEvent: () => api().fromEvent()?.handle,
    getEventType: () => api().getEventHandle(),
    clearPoints: (frame) => {
        wrap(frame).clearPoints();
    },
    setPoint: (frame, point, relative, relativePoint, x, y) => {
        wrap(frame).setPoint(point, wrap(relative), relativePoint, x, y);
    },
    setAbsPoint: (frame, point, x, y) => {
        wrap(frame).setAbsPoint(point, x, y);
    },
    setAllPoints: (frame, relative) => {
        wrap(frame).setAllPoints(wrap(relative));
    },
    setSize: (frame, width, height) => {
        wrap(frame).setSize(width, height);
    },
    setScale: (frame, scale) => {
        wrap(frame).setScale(scale);
    },
    setLevel: (frame, level) => {
        wrap(frame).setLevel(level);
    },
    setVisible: (frame, visible) => {
        wrap(frame).setVisible(visible);
    },
    isVisible: (frame) => wrap(frame).visible,
    setText: (frame, text) => {
        wrap(frame).setText(text);
    },
    setFont: (frame, path, height, flags) => {
        wrap(frame).setFont(path, height, flags);
    },
    setTextColor: (frame, color) => {
        wrap(frame).setTextColor(color);
    },
    setTexture: (frame, path, flag, blend) => {
        wrap(frame).setTexture(path, flag, blend);
    },
    setModel: (frame, path, cameraIndex) => {
        wrap(frame).setModel(path, cameraIndex);
    },
    setSpriteAnimate: (frame, primaryProp, flags) => {
        wrap(frame).setSpriteAnimate(primaryProp, flags);
    },
    setEnabled: (frame, enabled) => {
        wrap(frame).setEnabled(enabled);
    },
    resetFocus(frame) {
        wrap(frame).setEnabled(false);
        wrap(frame).setEnabled(true);
    },
    registerEvent(target, frame, event) {
        BlzTriggerRegisterFrameEvent(target, frame, event);
    },
    destroy: (frame) => {
        wrap(frame).destroy();
    },
};
