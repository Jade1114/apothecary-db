import { Module } from '@nestjs/common';
import { watch } from 'node:fs';
import { IngestModule } from '../ingest/ingest.module';
import { VAULT_WATCH_FACTORY } from './watcher.types';
import { VaultWatcherService } from './vault-watcher.service';

@Module({
    imports: [IngestModule],
    providers: [
        VaultWatcherService,
        {
            provide: VAULT_WATCH_FACTORY,
            useValue: watch,
        },
    ],
})
export class WatcherModule {}
