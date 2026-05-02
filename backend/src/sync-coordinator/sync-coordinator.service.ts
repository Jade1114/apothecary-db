import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { IngestService } from '../ingest/ingest.service';
import type { VaultScanResponse } from '../ingest/types/vault-scan.types';

type ScanWaiter = {
    resolve: (result: VaultScanResponse) => void;
    reject: (error: unknown) => void;
};

@Injectable()
export class SyncCoordinatorService implements OnApplicationShutdown {
    private readonly logger = new Logger(SyncCoordinatorService.name);
    private debounceTimer: NodeJS.Timeout | null = null;
    private scanInFlight = false;
    private scanRequested = false;
    private pendingScanReason = 'unknown';
    private scanWaiters: ScanWaiter[] = [];
    private closed = false;

    constructor(
        private readonly configService: ConfigService,
        private readonly ingestService: IngestService,
    ) {}

    onApplicationShutdown(): void {
        this.close();
    }

    requestScan(reason: string): void {
        if (this.closed) {
            return;
        }

        this.scanRequested = true;
        this.pendingScanReason = reason;
        this.resetDebounceTimer();
    }

    runScanNow(reason: string): Promise<VaultScanResponse> {
        if (this.closed) {
            return Promise.reject(new Error('SyncCoordinatorService is closed'));
        }

        this.scanRequested = true;
        this.pendingScanReason = reason;
        this.clearDebounceTimer();

        const result = new Promise<VaultScanResponse>((resolve, reject) => {
            this.scanWaiters.push({ resolve, reject });
        });
        void this.drainScanQueue();
        return result;
    }

    close(): void {
        this.closed = true;
        this.clearDebounceTimer();

        this.scanRequested = false;
        this.rejectPendingWaiters(new Error('SyncCoordinatorService is closed'));
    }

    private resetDebounceTimer(): void {
        this.clearDebounceTimer();

        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            void this.drainScanQueue();
        }, this.configService.watcherDebounceMs);
        this.debounceTimer.unref?.();
    }

    private async drainScanQueue(): Promise<void> {
        if (this.closed || this.scanInFlight) {
            return;
        }

        this.scanInFlight = true;

        try {
            while (this.scanRequested && !this.closed) {
                this.clearDebounceTimer();
                const reason = this.pendingScanReason;
                const waiters = this.consumePendingWaiters();
                this.scanRequested = false;
                try {
                    const result = await this.runScan(reason);
                    this.resolveWaiters(waiters, result);
                } catch (error) {
                    this.rejectWaiters(waiters, error);
                }
            }
        } finally {
            this.scanInFlight = false;

            if (this.scanRequested && !this.closed) {
                this.resetDebounceTimer();
            }
        }
    }

    private clearDebounceTimer(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    private async runScan(reason: string): Promise<VaultScanResponse> {
        try {
            this.logger.log(`Running vault scan: ${reason}`);
            const result = await this.ingestService.scanVault();
            this.logger.log(
                `Vault scan finished: scanned=${result.scannedCount}, imported=${result.importedCount}, deleted=${result.deletedCount}, failed=${result.failedCount}`,
            );
            return result;
        } catch (error) {
            this.logger.error(
                `Vault scan failed: ${this.getErrorMessage(error)}`,
            );
            throw error;
        }
    }

    private consumePendingWaiters(): ScanWaiter[] {
        const waiters = this.scanWaiters;
        this.scanWaiters = [];
        return waiters;
    }

    private resolveWaiters(waiters: ScanWaiter[], result: VaultScanResponse): void {
        for (const waiter of waiters) {
            waiter.resolve(result);
        }
    }

    private rejectPendingWaiters(error: unknown): void {
        this.rejectWaiters(this.consumePendingWaiters(), error);
    }

    private rejectWaiters(waiters: ScanWaiter[], error: unknown): void {
        for (const waiter of waiters) {
            waiter.reject(error);
        }
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
