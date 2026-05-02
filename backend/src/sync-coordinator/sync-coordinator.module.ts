import { forwardRef, Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { StartupSyncService } from './startup-sync.service';
import { SyncCoordinatorService } from './sync-coordinator.service';

@Module({
    imports: [forwardRef(() => IngestModule)],
    providers: [SyncCoordinatorService, StartupSyncService],
    exports: [SyncCoordinatorService],
})
export class SyncCoordinatorModule {}
