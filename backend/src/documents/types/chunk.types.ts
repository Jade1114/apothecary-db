export type ChunkRecord = {
    id: number;
    documentId: number;
    chunkIndex: number;
    text: string;
    tokenCount: number | null;
    createdAt: string;
};

export type ChunkVectorRecord = {
    chunkId: number;
    vectorId: string;
    provider: string;
    dimension: number;
    createdAt: string;
};
