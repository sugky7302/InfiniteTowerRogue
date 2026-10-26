export type Sync = "sync";
export type Local = "local";
export type SyncKind = Sync | Local;
export type CombinedKind<A extends SyncKind, B extends SyncKind> = Local extends A | B
    ? Local
    : Sync;
