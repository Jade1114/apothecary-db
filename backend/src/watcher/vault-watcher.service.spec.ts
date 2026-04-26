import { EventEmitter } from 'node:events';
import type { FSWatcher } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '../config/config.service';
import type { SyncCoordinatorService } from '../sync-coordinator/sync-coordinator.service';
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
    let syncCoordinatorService: { requestScan: jest.Mock<void, [string]> };
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
        syncCoordinatorService = {
            requestScan: jest.fn(),
        };

        service = new VaultWatcherService(
            createConfigService(),
            syncCoordinatorService as unknown as SyncCoordinatorService,
            watchFactory,
        );
    });

    afterEach(async () => {
        service.close();
        jest.useRealTimers();
        await rm(vaultPath, { recursive: true, force: true });
    });

    it('should start watching and request an initial scan on bootstrap', async () => {
        await service.onApplicationBootstrap();

        expect(watchFactory).toHaveBeenCalledWith(
            vaultPath,
            { recursive: true },
            expect.any(Function),
        );
        expect(syncCoordinatorService.requestScan).toHaveBeenCalledWith(
            'startup',
        );
    });

    it('should forward supported file events and ignore internal paths', async () => {
        await service.start();

        listener('change', 'alpha.md');
        listener('change', 'alpha.md');
        listener('change', '.apothecary/normalized/alpha.md');
        listener('change', 'image.png');

        expect(syncCoordinatorService.requestScan).toHaveBeenCalledTimes(2);
        expect(syncCoordinatorService.requestScan).toHaveBeenNthCalledWith(
            1,
            'change:alpha.md',
        );
        expect(syncCoordinatorService.requestScan).toHaveBeenNthCalledWith(
            2,
            'change:alpha.md',
        );
    });

    it('should forward events without a filename to allow full reconcile', async () => {
        await service.start();

        listener('rename', null);

        expect(syncCoordinatorService.requestScan).toHaveBeenCalledWith(
            'rename:unknown',
        );
    });

    it('should close the watcher', async () => {
        await service.start();

        service.close();

        expect(fakeWatcher.close).toHaveBeenCalledTimes(1);
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
