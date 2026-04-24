import { Module } from '@nestjs/common';
import { SyncJobsService } from './sync-jobs.service';

@Module({
    providers: [SyncJobsService],
    exports: [SyncJobsService],
})
export class SyncModule {}
