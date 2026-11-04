import { SaveRegistry, SaveField, SaveRecord, SaveData } from "@features/save";

export const recordField: SaveField = {
    name: "rows",
    kind: "records",
    maxLength: 3,
    fields: [
        { name: "tier", kind: "uint", min: 0, max: 3 },
        { name: "value", kind: "uint", min: 2, max: 6 },
        { name: "enabled", kind: "boolean" },
        { name: "fixed", kind: "list", min: 0, max: 1, length: 2 },
        {
            name: "extra",
            kind: "dependent-list",
            min: 0,
            max: 16777215,
            lengthFrom: "tier",
            lengths: [0, 1, 2, 3],
        },
    ],
};
export function recordRegistry(field: SaveField = recordField): SaveRegistry {
    return new SaveRegistry().register({ version: 1, sections: [{ name: "s", fields: [field] }] });
}
export function recordRow(tier: number): SaveRecord {
    return {
        tier,
        value: 6,
        enabled: false,
        fixed: [0, 1],
        extra: Array.from({ length: tier }, () => 16777215),
    };
}
function check(value: boolean): void {
    if (!value) throw new Error("紀錄清單驗證失敗。");
}
export const recordsCases: { name: string; run: (this: void) => void }[] = [
    {
        name: "紀錄清單可保存空清單與最大數量，含零長度欄位",
        run() {
            for (const rows of [[], [recordRow(0)], [recordRow(1), recordRow(2), recordRow(3)]]) {
                const registry = recordRegistry();
                const loaded = registry.unpack(registry.pack({ s: { rows } }, 1)!, 1)!;
                const result = loaded.s.rows as SaveRecord[];
                check(result.length === rows.length);
                for (let index = 0; index < rows.length; index++) {
                    check(
                        result[index].tier === rows[index].tier &&
                            result[index].enabled === false &&
                            result[index].value === 6,
                    );
                    check(
                        (result[index].extra as number[]).join(",") ===
                            (rows[index].extra as number[]).join(","),
                    );
                    check((result[index].fixed as number[]).join(",") === "0,1");
                }
            }
        },
    },
    {
        name: "紀錄清單拒絕過量、錯誤型別、缺欄位與錯誤長度",
        run() {
            const registry = recordRegistry();
            const bad: unknown[] = [
                false,
                [1],
                [[]],
                Array.from({ length: 4 }, () => recordRow(0)),
                [{}],
                [{ ...recordRow(0), value: 7 }],
                [{ ...recordRow(0), enabled: 0 }],
                [{ ...recordRow(1), extra: [] }],
                [{ ...recordRow(0), fixed: [1] }],
                [{ ...recordRow(1), extra: [1.5] }],
                [{ ...recordRow(0), tier: 4 }],
            ];
            for (const rows of bad)
                check(registry.pack({ s: { rows } } as SaveData, 1) === undefined);
        },
    },
    {
        name: "紀錄清單拒絕截斷、額外位元組、非零填補與未用碼值",
        run() {
            const registry = recordRegistry();
            const bytes = registry.pack({ s: { rows: [recordRow(0)] } }, 1)!;
            check(registry.unpack(bytes.slice(0, -1), 1) === undefined);
            check(registry.unpack([...bytes, 0], 1) === undefined);
            const padding = [...bytes];
            padding[padding.length - 1] += 1;
            check(registry.unpack(padding, 1) === undefined);
            // 數量 1、階級 0、值碼 7。值的合法碼值是 0～4。
            check(registry.unpack([1, 78, 0], 1) === undefined);
            const count = recordRegistry({ ...recordField, maxLength: 2 } as SaveField);
            check(count.unpack([1, 192], 1) === undefined);
        },
    },
    {
        name: "紀錄定義與相依長度表在登錄時複製",
        run() {
            const lengths = [0, 1];
            const fields = [
                { name: "tier", kind: "uint" as const, min: 0, max: 1 },
                {
                    name: "extra",
                    kind: "dependent-list" as const,
                    min: 0,
                    max: 7,
                    lengthFrom: "tier",
                    lengths,
                },
            ];
            const registry = recordRegistry({
                name: "rows",
                kind: "records",
                maxLength: 1,
                fields,
            });
            lengths[1] = 99;
            fields[0].max = 7;
            const snapshot = registry.snapshot();
            check(snapshot.pack({ s: { rows: [{ tier: 1, extra: [7] }] } }, 1) !== undefined);
            check(snapshot.pack({ s: { rows: [{ tier: 2, extra: [] }] } }, 1) === undefined);
        },
    },
];
export function verifyRecords(): number {
    for (const entry of recordsCases) {
        try {
            entry.run();
        } catch (error) {
            const message =
                typeof error === "string"
                    ? error
                    : ((error as { message?: string }).message ?? "未知錯誤。");
            throw new Error(`${entry.name}。${message}`);
        }
    }
    return recordsCases.length;
}
