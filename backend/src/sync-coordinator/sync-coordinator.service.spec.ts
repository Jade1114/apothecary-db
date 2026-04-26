import type { ConfigService } from '../config/config.service';
import type { IngestService } from '../ingest/ingest.service';
import type { VaultScanResponse } from '../ingest/types/vault-scan.types';
import { SyncCoordinatorService } from './sync-coordinator.service';

describe('SyncCoordinatorService', () => {
    let debounceMs: number;
    let ingestService: { scanVault: jest.Mock<Promise<VaultScanResponse>, []> };
    let service: SyncCoordinatorService;

    beforeEach(() => {
        jest.useFakeTimers();

        debounceMs = 50;
        ingestService = {
            scanVault: jest.fn().mockResolvedValue(createScanResult()),
        };

        service = new SyncCoordinatorService(
            createConfigService(),
            ingestService as unknown as IngestService,
        );
    });

    afterEach(() => {
        service.close();
        jest.useRealTimers();
    });

    it('should debounce scan requests', async () => {
        service.requestScan('first');
        service.requestScan('second');

        await jest.advanceTimersByTimeAsync(debounceMs);

        expect(ingestService.scanVault).toHaveBeenCalledTimes(1);
    });

    it('should run a follow-up scan when a request arrives during a scan', async () => {
        let releaseFirstScan!: () => void;
        const firstScanStarted = new Promise<void>((resolve) => {
            ingestService.scanVault.mockImplementationOnce(async () => {
                resolve();
                await new Promise<void>((release) => {
                    releaseFirstScan = release;
                });
                return createScanResult();
            });
        });
        const secondScanStarted = new Promise<void>((resolve) => {
            ingestService.scanVault.mockImplementationOnce(async () => {
                resolve();
                return createScanResult();
            });
        });

        service.requestScan('first');
        await jest.advanceTimersByTimeAsync(debounceMs);
        await firstScanStarted;

        service.requestScan('second');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(ingestService.scanVault).toHaveBeenCalledTimes(1);

        releaseFirstScan();
        await secondScanStarted;

        expect(ingestService.scanVault).toHaveBeenCalledTimes(2);
    });

    it('should allow later scans after a scan failure', async () => {
        ingestService.scanVault
            .mockRejectedValueOnce(new Error('scan failed'))
            .mockResolvedValue(createScanResult());

        service.requestScan('first');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(ingestService.scanVault).toHaveBeenCalledTimes(1);

        service.requestScan('second');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(ingestService.scanVault).toHaveBeenCalledTimes(2);
    });

    it('should discard pending scans after close', async () => {
        service.requestScan('close');
        service.close();
        await jest.advanceTimersByTimeAsync(debounceMs);

        expect(ingestService.scanVault).not.toHaveBeenCalled();
    });

    function createConfigService(): ConfigService {
        return {
            get watcherDebounceMs(): number {
                return debounceMs;
            },
        } as ConfigService;
    }
});

function createScanResult(): VaultScanResponse {
    return {
        vaultPath: '',
        scannedCount: 0,
        reconciledCount: 0,
        importedCount: 0,
        skippedCount: 0,
        deletedCount: 0,
        failedCount: 0,
        breakdown: {
            newCount: 0,
            changedCount: 0,
            unchangedCount: 0,
            deletedCount: 0,
        },
        items: [],
    };
}
