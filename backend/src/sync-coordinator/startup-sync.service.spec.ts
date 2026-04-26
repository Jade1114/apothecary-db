import type { SyncCoordinatorService } from './sync-coordinator.service';
import { StartupSyncService } from './startup-sync.service';

describe('StartupSyncService', () => {
    it('should request a startup scan on application bootstrap', () => {
        const syncCoordinatorService = {
            requestScan: jest.fn(),
        };
        const service = new StartupSyncService(
            syncCoordinatorService as unknown as SyncCoordinatorService,
        );

        service.onApplicationBootstrap();

        expect(syncCoordinatorService.requestScan).toHaveBeenCalledWith(
            'startup',
        );
    });
});
