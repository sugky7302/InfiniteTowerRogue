export const Phase = {
    Combat: 0,
    Extraction: 1,
    World: 2,
    Default: 3,
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];
