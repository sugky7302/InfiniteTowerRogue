/** 只包裝框架原生操作。框架 handle 不包含 w3ts 相依。 */
export interface FrameNatives {
    loadTOC(path: string): boolean;
    create(
        template: string,
        parent: framehandle,
        priority: number,
        context: number,
    ): framehandle | undefined;
    createType(
        name: string,
        parent: framehandle,
        context: number,
        type: string,
        inherits: string,
    ): framehandle | undefined;
    fromOrigin(type: originframetype, index: number): framehandle | undefined;
    fromName(name: string, context: number): framehandle | undefined;
    getChild(frame: framehandle, index: number): framehandle | undefined;
    fromEvent(): framehandle | undefined;
    getEventType(): frameeventtype | undefined;
    clearPoints(frame: framehandle): void;
    setPoint(
        frame: framehandle,
        point: framepointtype,
        relative: framehandle,
        relativePoint: framepointtype,
        x: number,
        y: number,
    ): void;
    setAbsPoint(frame: framehandle, point: framepointtype, x: number, y: number): void;
    setAllPoints(frame: framehandle, relative: framehandle): void;
    setSize(frame: framehandle, width: number, height: number): void;
    setScale(frame: framehandle, scale: number): void;
    setLevel(frame: framehandle, level: number): void;
    setVisible(frame: framehandle, visible: boolean): void;
    /** 本地查詢。結果只能用來呈現介面或訊息。 */
    isVisible(frame: framehandle): boolean;
    setText(frame: framehandle, text: string): void;
    setFont(frame: framehandle, path: string, height: number, flags: number): void;
    setTextColor(frame: framehandle, color: number): void;
    setTexture(frame: framehandle, path: string, flag: number, blend: boolean): void;
    setModel(frame: framehandle, path: string, cameraIndex: number): void;
    setSpriteAnimate(frame: framehandle, primaryProp: number, flags: number): void;
    setEnabled(frame: framehandle, enabled: boolean): void;
    resetFocus(frame: framehandle): void;
    registerEvent(trigger: trigger, frame: framehandle, event: frameeventtype): void;
    destroy(frame: framehandle): void;
}
