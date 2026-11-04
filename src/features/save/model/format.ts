import { NumberAudit } from "../lib/hash";

export type SaveValue = number | boolean | number[];
export type SaveData = Record<string, Record<string, SaveValue>>;
export type SaveField =
    | { name: string; kind: "uint"; min: number; max: number }
    | { name: string; kind: "boolean" }
    | { name: string; kind: "list"; min: number; max: number; length: number };
export interface SaveSection {
    name: string;
    fields: readonly SaveField[];
}
export interface SaveVersion {
    version: number;
    sections: readonly SaveSection[];
    /** 將此版本轉為下一個版本。不得讀取本地或遊戲狀態。 */
    migrate?: (this: void, data: SaveData) => SaveData;
}
export const maxPackedBytes = 512;

function integer(value: number, min: number, max: number): boolean {
    return value >= min && value <= max && Math.floor(value) === value;
}

function fieldBits(field: SaveField): number {
    if (field.kind === "boolean") return 1;
    let bits = 0;
    let range = field.max - field.min;
    while (range > 0) {
        bits++;
        range = Math.floor(range / 2);
    }
    return bits;
}

/** 先登錄版本與區段，再建立編碼器。既有版本的順序與範圍不可更改。 */
export class SaveRegistry {
    private readonly versions = new Map<number, SaveVersion>();

    public register(format: SaveVersion): this {
        if (!integer(format.version, 1, 255) || this.versions.has(format.version))
            throw new Error("存檔格式版本無效或重複。");
        const names = new Set<string>();
        let bits = 8;
        for (const section of format.sections) {
            if (section.name.length === 0 || names.has(section.name))
                throw new Error("存檔區段名稱無效或重複。");
            names.add(section.name);
            const fields = new Set<string>();
            for (const field of section.fields) {
                if (field.name.length === 0 || fields.has(field.name))
                    throw new Error("存檔欄位名稱無效或重複。");
                fields.add(field.name);
                if (
                    field.kind !== "boolean" &&
                    (!integer(field.min, 0, 16777215) || !integer(field.max, field.min, 16777215))
                )
                    throw new Error("存檔欄位範圍無效。");
                if (field.kind === "list" && !integer(field.length, 1, 256))
                    throw new Error("存檔清單長度無效。");
                bits += fieldBits(field) * (field.kind === "list" ? field.length : 1);
                if (bits > maxPackedBytes * 8) throw new Error("存檔格式超過打包上限。");
            }
        }
        this.versions.set(format.version, {
            ...format,
            sections: format.sections.map((section) => ({
                ...section,
                fields: section.fields.map((field) => ({ ...field })),
            })),
        });
        return this;
    }

    public snapshot(): SaveRegistry {
        const result = new SaveRegistry();
        for (const format of this.versions.values()) result.register(format);
        return result;
    }

    public pack(data: SaveData, version: number, audit?: NumberAudit): number[] | undefined {
        const format = this.versions.get(version);
        if (format === undefined) return undefined;
        const output = [version];
        let byte = 0;
        let used = 0;
        for (const section of format.sections) {
            const values = data[section.name];
            if (values === undefined) return undefined;
            for (const field of section.fields) {
                const value = values[field.name];
                const list = field.kind === "list" ? value : [value];
                if (
                    !Array.isArray(list) ||
                    list.length !== (field.kind === "list" ? field.length : 1)
                )
                    return undefined;
                for (const entry of list) {
                    let packed: number;
                    if (field.kind === "boolean") {
                        if (typeof entry !== "boolean") return undefined;
                        packed = entry ? 1 : 0;
                    } else {
                        if (typeof entry !== "number" || !integer(entry, field.min, field.max))
                            return undefined;
                        packed = entry - field.min;
                        audit?.(packed);
                    }
                    const bits = fieldBits(field);
                    for (let index = 0; index < bits; index++) {
                        const divisor = 2 ** (bits - index - 1);
                        audit?.(divisor);
                        byte = byte * 2 + (Math.floor(packed / divisor) % 2);
                        audit?.(byte);
                        if (++used === 8) {
                            output.push(byte);
                            byte = 0;
                            used = 0;
                        }
                    }
                }
            }
        }
        if (used > 0) output.push(byte * 2 ** (8 - used));
        for (const value of output) audit?.(value);
        return output;
    }

    public unpack(
        bytes: readonly number[],
        currentVersion: number,
        audit?: NumberAudit,
    ): SaveData | undefined {
        const format = this.versions.get(bytes[0]);
        if (format === undefined || format.version > currentVersion) return undefined;
        let position = 8;
        let data: SaveData = {};
        for (const section of format.sections) {
            const values: Record<string, SaveValue> = {};
            data[section.name] = values;
            for (const field of section.fields) {
                const entries: SaveValue[] = [];
                for (let entry = 0; entry < (field.kind === "list" ? field.length : 1); entry++) {
                    let value = 0;
                    for (let index = 0; index < fieldBits(field); index++) {
                        if (position >= bytes.length * 8) return undefined;
                        value =
                            value * 2 +
                            (Math.floor(
                                bytes[Math.floor(position / 8)] / 2 ** (7 - (position % 8)),
                            ) %
                                2);
                        audit?.(value);
                        position++;
                    }
                    if (field.kind === "boolean") entries.push(value === 1);
                    else {
                        if (value > field.max - field.min) return undefined;
                        value += field.min;
                        audit?.(value);
                        entries.push(value);
                    }
                }
                values[field.name] = field.kind === "list" ? (entries as number[]) : entries[0];
            }
        }
        if (Math.ceil(position / 8) !== bytes.length) return undefined;
        while (position < bytes.length * 8) {
            if ((bytes[Math.floor(position / 8)] & (1 << (7 - (position % 8)))) !== 0)
                return undefined;
            position++;
        }
        for (let version = format.version; version < currentVersion; version++) {
            const migrate = this.versions.get(version)?.migrate;
            if (migrate === undefined) return undefined;
            data = migrate(data);
            if (this.pack(data, version + 1, audit) === undefined) return undefined;
        }
        return data;
    }
}
