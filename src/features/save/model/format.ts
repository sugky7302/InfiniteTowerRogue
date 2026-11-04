import { NumberAudit } from "../lib/hash";

export type SaveRecord = Record<string, number | boolean | number[]>;
export type SaveValue = number | boolean | number[] | SaveRecord[];
export type SaveData = Record<string, Record<string, SaveValue>>;
export type SaveScalarField =
    | { name: string; kind: "uint"; min: number; max: number }
    | { name: string; kind: "boolean" }
    | { name: string; kind: "list"; min: number; max: number; length: number };
export type SaveRecordField =
    | SaveScalarField
    | {
          name: string;
          kind: "dependent-list";
          min: number;
          max: number;
          lengthFrom: string;
          lengths: readonly number[];
      };
export type SaveField =
    | SaveScalarField
    | {
          name: string;
          kind: "records";
          maxLength: number;
          fields: readonly SaveRecordField[];
      };
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
export const maxPackedBytes = 768;
function integer(value: number, min: number, max: number): boolean {
    return value >= min && value <= max && Math.floor(value) === value;
}
function width(max: number): number {
    let bits = 0;
    while (max > 0) {
        bits++;
        max = Math.floor(max / 2);
    }
    return bits;
}
function fieldBits(field: SaveRecordField): number {
    return field.kind === "boolean" ? 1 : width(field.max - field.min);
}
function validateFields(fields: readonly SaveRecordField[]): number {
    const names = new Map<string, SaveRecordField>();
    let bits = 0;
    for (const field of fields) {
        if (field.name.length === 0 || names.has(field.name))
            throw new Error("存檔欄位名稱無效或重複。");
        if (
            field.kind !== "boolean" &&
            (!integer(field.min, 0, 16777215) || !integer(field.max, field.min, 16777215))
        )
            throw new Error("存檔欄位範圍無效。");
        let length = 1;
        if (field.kind === "list") {
            if (!integer(field.length, 1, 256)) throw new Error("存檔清單長度無效。");
            length = field.length;
        }
        if (field.kind === "dependent-list") {
            const source = names.get(field.lengthFrom);
            if (
                source?.kind !== "uint" ||
                source.min !== 0 ||
                source.max + 1 !== field.lengths.length
            )
                throw new Error("存檔清單的長度來源無效。");
            length = 0;
            for (const count of field.lengths) {
                if (!integer(count, 0, 256)) throw new Error("存檔清單長度無效。");
                length = Math.max(length, count);
            }
        }
        bits += fieldBits(field) * length;
        names.set(field.name, field);
    }
    return bits;
}
function copyField(field: SaveRecordField): SaveRecordField {
    return field.kind === "dependent-list"
        ? { ...field, lengths: [...field.lengths] }
        : { ...field };
}

/** 先登錄版本與區段。既有版本的順序與範圍不可更改。 */
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
                if (fields.has(field.name) || field.name.length === 0)
                    throw new Error("存檔欄位名稱無效或重複。");
                fields.add(field.name);
                if (field.kind === "records") {
                    if (!integer(field.maxLength, 1, 256) || field.fields.length === 0)
                        throw new Error("存檔紀錄清單無效。");
                    bits += width(field.maxLength) + field.maxLength * validateFields(field.fields);
                } else bits += validateFields([field]);
                if (bits > maxPackedBytes * 8) throw new Error("存檔格式超過打包上限。");
            }
        }
        this.versions.set(format.version, {
            ...format,
            sections: format.sections.map((section) => ({
                ...section,
                fields: section.fields.map((field) =>
                    field.kind === "records"
                        ? { ...field, fields: field.fields.map((entry) => copyField(entry)) }
                        : { ...field },
                ),
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
        let byte = 0,
            used = 0;
        const write = (value: number, bits: number): void => {
            audit?.(value);
            for (let index = 0; index < bits; index++) {
                const divisor = 2 ** (bits - index - 1);
                audit?.(divisor);
                byte = byte * 2 + (Math.floor(value / divisor) % 2);
                audit?.(byte);
                if (++used === 8) {
                    output.push(byte);
                    byte = 0;
                    used = 0;
                }
            }
        };
        const fields = (
            definitions: readonly SaveRecordField[],
            values: Record<string, SaveValue>,
        ): boolean => {
            for (const field of definitions) {
                const value = values[field.name];
                const length =
                    field.kind === "list"
                        ? field.length
                        : field.kind === "dependent-list"
                          ? field.lengths[values[field.lengthFrom] as number]
                          : 1;
                const list =
                    field.kind === "list" || field.kind === "dependent-list" ? value : [value];
                if (!Array.isArray(list) || length === undefined || list.length !== length)
                    return false;
                for (const entry of list) {
                    if (field.kind === "boolean") {
                        if (typeof entry !== "boolean") return false;
                        write(entry ? 1 : 0, 1);
                    } else {
                        if (typeof entry !== "number" || !integer(entry, field.min, field.max))
                            return false;
                        write(entry - field.min, fieldBits(field));
                    }
                }
            }
            return true;
        };
        for (const section of format.sections) {
            const values = data[section.name];
            if (values === undefined) return undefined;
            for (const field of section.fields) {
                if (field.kind !== "records") {
                    if (!fields([field], values)) return undefined;
                    continue;
                }
                const list = values[field.name];
                if (!Array.isArray(list) || list.length > field.maxLength) return undefined;
                write(list.length, width(field.maxLength));
                for (const record of list) {
                    if (
                        typeof record !== "object" ||
                        record === null ||
                        Array.isArray(record) ||
                        !fields(field.fields, record)
                    )
                        return undefined;
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
        if (bytes.length > maxPackedBytes || bytes.some((value) => !integer(value, 0, 255)))
            return undefined;
        const format = this.versions.get(bytes[0]);
        if (format === undefined || format.version > currentVersion) return undefined;
        let position = 8;
        let data: SaveData = {};
        const read = (bits: number): number | undefined => {
            let value = 0;
            for (let index = 0; index < bits; index++) {
                if (position >= bytes.length * 8) return undefined;
                value =
                    value * 2 +
                    (Math.floor(bytes[Math.floor(position / 8)] / 2 ** (7 - (position % 8))) % 2);
                audit?.(value);
                position++;
            }
            return value;
        };
        const fields = (definitions: readonly SaveRecordField[]): SaveRecord | undefined => {
            const values: SaveRecord = {};
            for (const field of definitions) {
                const length =
                    field.kind === "list"
                        ? field.length
                        : field.kind === "dependent-list"
                          ? field.lengths[values[field.lengthFrom] as number]
                          : 1;
                if (length === undefined) return undefined;
                const entries: number[] = [];
                for (let entry = 0; entry < length; entry++) {
                    let value = read(fieldBits(field));
                    if (value === undefined) return undefined;
                    if (field.kind === "boolean") {
                        values[field.name] = value === 1;
                    } else {
                        if (value > field.max - field.min) return undefined;
                        value += field.min;
                        audit?.(value);
                        entries.push(value);
                    }
                }
                if (field.kind !== "boolean")
                    values[field.name] = field.kind === "uint" ? entries[0] : entries;
            }
            return values;
        };
        for (const section of format.sections) {
            const values: Record<string, SaveValue> = {};
            data[section.name] = values;
            for (const field of section.fields) {
                if (field.kind !== "records") {
                    const result = fields([field]);
                    if (result === undefined) return undefined;
                    values[field.name] = result[field.name];
                    continue;
                }
                const length = read(width(field.maxLength));
                if (length === undefined || length > field.maxLength) return undefined;
                const records: SaveRecord[] = [];
                for (let entry = 0; entry < length; entry++) {
                    const record = fields(field.fields);
                    if (record === undefined) return undefined;
                    records.push(record);
                }
                values[field.name] = records;
            }
        }
        if (Math.ceil(position / 8) !== bytes.length) return undefined;
        while (position < bytes.length * 8) {
            if (read(1) !== 0) return undefined;
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
