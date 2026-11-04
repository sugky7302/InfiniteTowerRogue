import { SaveData, SaveRegistry } from "./format";
import { SaveCodec } from "./codec";
import { SaveParticipant } from "./participant";

/** 目錄索引固定，已發行的索引不得改指向其他物品。0 表示空格。 */
export const demoItemCatalog = ["", "ratf", "rst1", "rde1"] as const;
export const demoSaveVersion = 2;

export function createDemoRegistry(participants: readonly SaveParticipant[] = []): SaveRegistry {
    const registry = new SaveRegistry();
    registry.register({
        version: 1,
        sections: [
            {
                name: "demo",
                fields: [
                    { name: "level", kind: "uint", min: 1, max: 100 },
                    { name: "gold", kind: "uint", min: 0, max: 65535 },
                    { name: "items", kind: "list", min: 0, max: 3, length: 3 },
                ],
            },
        ],
        migrate: (data) => ({
            demo: { ...data.demo, items: [...(data.demo.items as number[]), 0, 0, 0] },
        }),
    });
    const demoSections = [
        {
            name: "demo",
            fields: [
                { name: "level", kind: "uint" as const, min: 1, max: 100 },
                { name: "gold", kind: "uint" as const, min: 0, max: 1000000 },
                {
                    name: "items",
                    kind: "list" as const,
                    min: 0,
                    max: demoItemCatalog.length - 1,
                    length: 6,
                },
            ],
        },
    ];
    registry.register({
        version: demoSaveVersion,
        sections: [
            {
                name: "demo",
                fields: [
                    { name: "level", kind: "uint", min: 1, max: 100 },
                    { name: "gold", kind: "uint", min: 0, max: 1000000 },
                    {
                        name: "items",
                        kind: "list",
                        min: 0,
                        max: demoItemCatalog.length - 1,
                        length: 6,
                    },
                ],
            },
        ],
        migrate:
            participants.length === 0
                ? undefined
                : (data) => {
                      const next: SaveData = { demo: data.demo };
                      for (const participant of participants) {
                          const values: SaveData[string] = {};
                          for (const key of Object.keys(participant.empty)) {
                              const value = participant.empty[key];
                              values[key] = Array.isArray(value) ? [...value] : value;
                          }
                          next[participant.section.name] = values;
                      }
                      return next;
                  },
    });
    if (participants.length > 0)
        registry.register({
            version: 3,
            sections: [...demoSections, ...participants.map((participant) => participant.section)],
        });
    return registry;
}

export function createDemoCodec(participants: readonly SaveParticipant[] = []): SaveCodec {
    return new SaveCodec(
        createDemoRegistry(participants),
        participants.length > 0 ? 3 : demoSaveVersion,
    );
}

export function initialDemoData(): SaveData {
    return { demo: { level: 1, gold: 0, items: [0, 0, 0, 0, 0, 0] } };
}

/** 只有驗證成功才修改資料。所有值都是同步範例資料。 */
export function changeDemo(data: SaveData, arguments_: readonly string[]): boolean {
    const value = arguments_[1] === undefined ? NaN : Number(arguments_[1]);
    if (!Number.isInteger(value)) return false;
    const demo = data.demo;
    if (arguments_.length === 2 && arguments_[0] === "level" && value >= 1 && value <= 100)
        demo.level = value;
    else if (arguments_.length === 2 && arguments_[0] === "gold" && value >= 0 && value <= 1000000)
        demo.gold = value;
    else if (arguments_.length === 3 && arguments_[0] === "item" && value >= 1 && value <= 6) {
        const item = Number(arguments_[2]);
        if (!Number.isInteger(item) || item < 0 || item >= demoItemCatalog.length) return false;
        (demo.items as number[])[value - 1] = item;
    } else return false;
    return true;
}
