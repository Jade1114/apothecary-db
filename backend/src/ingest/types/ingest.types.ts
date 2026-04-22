export type IngestResponse = {
    success: true;
    documentId: number;
    chunkCount: number;
    sourceType: string;
    sourceName: string | null;
    indexing: {
        embeddingReady: true;
        vectorReady: true;
        indexedPoints: number;
    };
};
