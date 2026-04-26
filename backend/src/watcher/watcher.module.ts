import { Module } from '@nestjs/common';
import { watch } from 'node:fs';
import { SyncCoordinatorModule } from '../sync-coordinator/sync-coordinator.module';
import { VAULT_WATCH_FACTORY } from './watcher.types';
import { VaultWatcherService } from './vault-watcher.service';

@Module({
    imports: [SyncCoordinatorModule],
    providers: [
        VaultWatcherService,
        {
            provide: VAULT_WATCH_FACTORY,
            useValue: watch,
        },
    ],
})
export class WatcherModule {}
