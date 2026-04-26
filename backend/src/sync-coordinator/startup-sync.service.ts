import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { SyncCoordinatorService } from './sync-coordinator.service';

@Injectable()
export class StartupSyncService implements OnApplicationBootstrap {
    constructor(
        private readonly syncCoordinatorService: SyncCoordinatorService,
    ) {}

    onApplicationBootstrap(): void {
        this.syncCoordinatorService.requestScan('startup');
    }
}
