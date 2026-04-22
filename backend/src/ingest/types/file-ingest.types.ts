import type { IngestResponse } from './ingest.types';

export type FileIngestResponse = IngestResponse & {
    sourcePath: string;
    normalizedPath: string;
    title: string | null;
};
