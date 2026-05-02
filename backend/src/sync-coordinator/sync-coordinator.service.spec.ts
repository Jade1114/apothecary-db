import type { ConfigService } from '../config/config.service';
import type { IngestService } from '../ingest/ingest.service';
import type { VaultScanResponse } from '../ingest/types/vault-scan.types';
import { SyncCoordinatorService } from './sync-coordinator.service';

describe('SyncCoordinatorService', () => {
    let debounceMs: number;
    let scanVault: jest.MockedFunction<() => Promise<VaultScanResponse>>;
    let ingestService: Pick<IngestService, 'scanVault'>;
    let service: SyncCoordinatorService;

    beforeEach(() => {
        jest.useFakeTimers();

        debounceMs = 50;
        scanVault = jest
            .fn<() => Promise<VaultScanResponse>>()
            .mockResolvedValue(createScanResult());
        ingestService = {
            scanVault,
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

        expect(scanVault).toHaveBeenCalledTimes(1);
    });

    it('should run manual scans immediately and return the scan result', async () => {
        const scanResult = createScanResult({ scannedCount: 3 });
        scanVault.mockResolvedValueOnce(scanResult);

        await expect(service.runScanNow('api:vault-scan')).resolves.toBe(scanResult);

        expect(scanVault).toHaveBeenCalledTimes(1);
    });

    it('should run a follow-up scan when a request arrives during a scan', async () => {
        let releaseFirstScan!: () => void;
        const firstScanStarted = new Promise<void>((resolve) => {
            scanVault.mockImplementationOnce(async () => {
                resolve();
                await new Promise<void>((release) => {
                    releaseFirstScan = release;
                });
                return createScanResult();
            });
        });
        const secondScanStarted = new Promise<void>((resolve) => {
            scanVault.mockImplementationOnce(() => {
                resolve();
                return Promise.resolve(createScanResult());
            });
        });

        service.requestScan('first');
        await jest.advanceTimersByTimeAsync(debounceMs);
        await firstScanStarted;

        service.requestScan('second');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(scanVault).toHaveBeenCalledTimes(1);

        releaseFirstScan();
        await secondScanStarted;

        expect(scanVault).toHaveBeenCalledTimes(2);
    });

    it('should serialize manual scans behind an in-flight debounced scan', async () => {
        let releaseFirstScan!: () => void;
        const firstScanStarted = new Promise<void>((resolve) => {
            scanVault.mockImplementationOnce(async () => {
                resolve();
                await new Promise<void>((release) => {
                    releaseFirstScan = release;
                });
                return createScanResult({ scannedCount: 1 });
            });
        });
        const manualScanResult = createScanResult({ scannedCount: 2 });
        scanVault.mockResolvedValueOnce(manualScanResult);

        service.requestScan('watcher');
        await jest.advanceTimersByTimeAsync(debounceMs);
        await firstScanStarted;

        const manualScan = service.runScanNow('api:vault-scan');
        expect(scanVault).toHaveBeenCalledTimes(1);

        releaseFirstScan();

        await expect(manualScan).resolves.toBe(manualScanResult);
        expect(scanVault).toHaveBeenCalledTimes(2);
    });

    it('should allow later scans after a scan failure', async () => {
        scanVault
            .mockRejectedValueOnce(new Error('scan failed'))
            .mockResolvedValue(createScanResult());

        service.requestScan('first');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(scanVault).toHaveBeenCalledTimes(1);

        service.requestScan('second');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(scanVault).toHaveBeenCalledTimes(2);
    });

    it('should reject manual scans when the scan fails', async () => {
        scanVault.mockRejectedValueOnce(new Error('scan failed'));

        await expect(service.runScanNow('api:vault-scan')).rejects.toThrow('scan failed');
        expect(scanVault).toHaveBeenCalledTimes(1);
    });

    it('should discard pending scans after close', async () => {
        service.requestScan('close');
        service.close();
        await jest.advanceTimersByTimeAsync(debounceMs);

        expect(scanVault).not.toHaveBeenCalled();
    });

    function createConfigService(): ConfigService {
        return {
            get watcherDebounceMs(): number {
                return debounceMs;
            },
        } as ConfigService;
    }
});

function createScanResult(overrides: Partial<VaultScanResponse> = {}): VaultScanResponse {
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
        ...overrides,
    };
}
