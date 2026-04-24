import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncJobRecord, SyncJobType } from './types/sync-job.types';

@Injectable()
export class SyncJobsService {
    constructor(private readonly databaseService: DatabaseService) {}

    startJob(jobType: SyncJobType, fileId: number | null = null): SyncJobRecord {
        const database = this.databaseService.getDatabase();
        const result = database
            .prepare(
                `
                INSERT INTO sync_jobs (file_id, job_type, status, error_message, updated_at)
                VALUES (?, ?, 'running', NULL, CURRENT_TIMESTAMP)
                `,
            )
            .run(fileId, jobType);

        return this.getJobById(Number(result.lastInsertRowid));
    }

    markSucceeded(jobId: number): void {
        this.updateJob(jobId, 'succeeded', null);
    }

    markFailed(jobId: number, errorMessage: string): void {
        this.updateJob(jobId, 'failed', errorMessage);
    }

    async runJob<T>(
        jobType: SyncJobType,
        fileId: number | null,
        work: () => Promise<T>,
    ): Promise<T> {
        const job = this.startJob(jobType, fileId);

        try {
            const result = await work();
            this.markSucceeded(job.id);
            return result;
        } catch (error) {
            this.markFailed(job.id, this.getErrorMessage(error));
            throw error;
        }
    }

    private getJobById(jobId: number): SyncJobRecord {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                `
                SELECT id, file_id, job_type, status, error_message, created_at, updated_at
                FROM sync_jobs
                WHERE id = ?
                `,
            )
            .get(jobId) as SyncJobRecord;
    }

    private updateJob(
        jobId: number,
        status: SyncJobRecord['status'],
        errorMessage: string | null,
    ): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE sync_jobs
                SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
            )
            .run(status, errorMessage, jobId);
    }

    private getErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : '同步任务失败';
    }
}
