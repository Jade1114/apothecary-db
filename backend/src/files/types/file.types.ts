export type FileStatus = 'active' | 'deleted' | 'error' | 'ignored';

export type FileRecord = {
    id: number;
    path: string;
    name: string;
    extension: string;
    kind: string;
    size: number;
    hash: string | null;
    status: FileStatus;
    created_at: string;
    updated_at: string;
    last_seen_at: string | null;
    deleted_at: string | null;
    last_normalized_path: string | null;
    normalized_retained_at: string | null;
};

export type RegisterFileReason = 'new' | 'changed' | 'unchanged';

export type RegisterFileResult = {
    file: FileRecord;
    shouldProcess: boolean;
    reason: RegisterFileReason;
};
