export type ChunkRecord = {
    id: number;
    documentId: number;
    chunkIndex: number;
    content: string;
    createdAt: string;
};

export type ChunkVectorRecord = {
    chunkId: number;
    vectorId: string;
    provider: string;
    dimension: number;
    createdAt: string;
};
