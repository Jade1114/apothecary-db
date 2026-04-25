import { EventEmitter } from 'node:events';
import type { FSWatcher } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '../config/config.service';
import type { IngestService } from '../ingest/ingest.service';
import type { VaultScanResponse } from '../ingest/types/vault-scan.types';
import { VaultWatcherService } from './vault-watcher.service';
import type { VaultWatchFactory, VaultWatchListener } from './watcher.types';

class FakeWatcher extends EventEmitter {
    close = jest.fn();
}

describe('VaultWatcherService', () => {
    let vaultPath: string;
    let debounceMs: number;
    let listener: VaultWatchListener;
    let fakeWatcher: FakeWatcher;
    let watchFactory: jest.MockedFunction<VaultWatchFactory>;
    let ingestService: { scanVault: jest.Mock<Promise<VaultScanResponse>, []> };
    let service: VaultWatcherService;

    beforeEach(async () => {
        jest.useFakeTimers();

        vaultPath = join(tmpdir(), `apothecary-watch-${Date.now()}`);
        debounceMs = 50;
        await mkdir(vaultPath, { recursive: true });

        fakeWatcher = new FakeWatcher();
        watchFactory = jest.fn((_, __, watchListener) => {
            listener = watchListener;
            return fakeWatcher as unknown as FSWatcher;
        });
        ingestService = {
            scanVault: jest.fn().mockResolvedValue(createScanResult()),
        };

        service = new VaultWatcherService(
            createConfigService(),
            ingestService as unknown as IngestService,
            watchFactory,
        );
    });

    afterEach(async () => {
        service.close();
        jest.useRealTimers();
        await rm(vaultPath, { recursive: true, force: true });
    });

    it('should start watching and trigger an initial debounced scan on bootstrap', async () => {
        await service.onApplicationBootstrap();

        expect(watchFactory).toHaveBeenCalledWith(
            vaultPath,
            { recursive: true },
            expect.any(Function),
        );
        expect(ingestService.scanVault).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(debounceMs);

        expect(ingestService.scanVault).toHaveBeenCalledTimes(1);
    });

    it('should debounce supported file events and ignore internal paths', async () => {
        await service.start();

        listener('change', 'alpha.md');
        listener('change', 'alpha.md');
        listener('change', '.apothecary/normalized/alpha.md');
        listener('change', 'image.png');

        await jest.advanceTimersByTimeAsync(debounceMs);

        expect(ingestService.scanVault).toHaveBeenCalledTimes(1);
    });

    it('should run a follow-up scan when an event arrives during a scan', async () => {
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

        await service.start();
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

        await service.start();

        service.requestScan('first');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(ingestService.scanVault).toHaveBeenCalledTimes(1);

        service.requestScan('second');
        await jest.advanceTimersByTimeAsync(debounceMs);
        expect(ingestService.scanVault).toHaveBeenCalledTimes(2);
    });

    it('should close the watcher and discard pending scans', async () => {
        await service.start();

        service.requestScan('close');
        service.close();
        await jest.advanceTimersByTimeAsync(debounceMs);

        expect(fakeWatcher.close).toHaveBeenCalledTimes(1);
        expect(ingestService.scanVault).not.toHaveBeenCalled();
    });

    function createConfigService(): ConfigService {
        return {
            get vaultPath(): string {
                return vaultPath;
            },
            get watcherEnabled(): boolean {
                return true;
            },
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
