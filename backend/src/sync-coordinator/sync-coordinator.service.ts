import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { IngestService } from '../ingest/ingest.service';

@Injectable()
export class SyncCoordinatorService implements OnApplicationShutdown {
    private readonly logger = new Logger(SyncCoordinatorService.name);
    private debounceTimer: NodeJS.Timeout | null = null;
    private scanInFlight = false;
    private scanRequested = false;
    private pendingScanReason = 'unknown';
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

    close(): void {
        this.closed = true;
        this.clearDebounceTimer();

        this.scanRequested = false;
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
                this.scanRequested = false;
                await this.runScan(reason);
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

    private async runScan(reason: string): Promise<void> {
        try {
            this.logger.log(`Running vault scan: ${reason}`);
            const result = await this.ingestService.scanVault();
            this.logger.log(
                `Vault scan finished: scanned=${result.scannedCount}, imported=${result.importedCount}, deleted=${result.deletedCount}, failed=${result.failedCount}`,
            );
        } catch (error) {
            this.logger.error(
                `Vault scan failed: ${this.getErrorMessage(error)}`,
            );
        }
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
