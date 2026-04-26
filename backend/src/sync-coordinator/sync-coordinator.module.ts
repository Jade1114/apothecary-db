import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { SyncCoordinatorService } from './sync-coordinator.service';

@Module({
    imports: [IngestModule],
    providers: [SyncCoordinatorService],
    exports: [SyncCoordinatorService],
})
export class SyncCoordinatorModule {}
