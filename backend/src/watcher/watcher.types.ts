import type { FSWatcher } from 'node:fs';

export const VAULT_WATCH_FACTORY = Symbol('VAULT_WATCH_FACTORY');

export type VaultWatchListener = (
    eventType: string,
    filename: string | Buffer | null,
) => void;

export type VaultWatchFactory = (
    filename: string,
    options: { recursive: boolean },
    listener: VaultWatchListener,
) => FSWatcher;
