import type { FileIngestResponse } from './file-ingest.types';

export type VaultScanItem = {
    filePath: string;
    success: boolean;
    result?: FileIngestResponse;
    error?: string;
};

export type VaultScanResponse = {
    vaultPath: string;
    scannedCount: number;
    importedCount: number;
    failedCount: number;
    items: VaultScanItem[];
};
