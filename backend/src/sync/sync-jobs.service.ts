import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { SyncJobRecord, SyncJobType } from './types/sync-job.types';

const INTERRUPTED_ERROR_MESSAGE = 'interrupted';

@Injectable()
export class SyncJobsService {
    private readonly activeJobIds = new Set<number>();

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

        const job = this.getJobById(Number(result.lastInsertRowid));
        this.activeJobIds.add(job.id);
        return job;
    }

    markSucceeded(jobId: number): void {
        try {
            this.updateJob(jobId, 'succeeded', null);
        } finally {
            this.activeJobIds.delete(jobId);
        }
    }

    markFailed(jobId: number, errorMessage: string): void {
        try {
            this.updateJob(jobId, 'failed', errorMessage);
        } finally {
            this.activeJobIds.delete(jobId);
        }
    }

    markRunningJobsInterrupted(): SyncJobRecord[] {
        const interruptedJobs = this.listRunningJobs().filter(
            (job) => !this.activeJobIds.has(job.id),
        );
        if (interruptedJobs.length === 0) {
            return [];
        }

        const database = this.databaseService.getDatabase();
        const jobIds = interruptedJobs.map((job) => job.id);
        const placeholders = jobIds.map(() => '?').join(', ');
        database
            .prepare(
                `
                UPDATE sync_jobs
                SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id IN (${placeholders})
                `,
            )
            .run(INTERRUPTED_ERROR_MESSAGE, ...jobIds);

        return interruptedJobs.map((job) => ({
            ...job,
            status: 'failed',
            error_message: INTERRUPTED_ERROR_MESSAGE,
        }));
    }

    async runJob<T>(
        jobType: SyncJobType,
        fileId: number | null,
        work: () => T | Promise<T>,
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

    private listRunningJobs(): SyncJobRecord[] {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                `
                SELECT id, file_id, job_type, status, error_message, created_at, updated_at
                FROM sync_jobs
                WHERE status = 'running'
                ORDER BY id ASC
                `,
            )
            .all() as SyncJobRecord[];
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
