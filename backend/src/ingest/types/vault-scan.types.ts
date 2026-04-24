import type { RegisterFileReason } from '../../files/types/file.types';
import type { FileIngestResponse } from './file-ingest.types';

export type VaultScanItemEvent = RegisterFileReason | 'deleted';

export type VaultScanItemAction = 'indexed' | 'skipped' | 'deleted';

export type VaultScanItem = {
    fileId: number;
    filePath: string;
    event: VaultScanItemEvent;
    action: VaultScanItemAction;
    success: boolean;
    result?: FileIngestResponse;
    error?: string;
};

export type VaultScanBreakdown = {
    newCount: number;
    changedCount: number;
    unchangedCount: number;
    deletedCount: number;
};

export type VaultScanResponse = {
    vaultPath: string;
    scannedCount: number;
    reconciledCount: number;
    importedCount: number;
    skippedCount: number;
    deletedCount: number;
    failedCount: number;
    breakdown: VaultScanBreakdown;
    items: VaultScanItem[];
};
