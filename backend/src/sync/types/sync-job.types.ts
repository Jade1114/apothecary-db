export type SyncJobType = 'scan' | 'parse' | 'index' | 'delete';

export type SyncJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type SyncJobRecord = {
    id: number;
    file_id: number | null;
    job_type: SyncJobType;
    status: SyncJobStatus;
    error_message: string | null;
    created_at: string;
    updated_at: string;
};
