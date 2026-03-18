import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface backendInterface {
    getSetting(key: string): Promise<string>;
    getWatchlist(): Promise<Array<string>>;
    setSetting(key: string, value: string): Promise<void>;
    updateWatchlist(pairs: Array<string>): Promise<void>;
}
