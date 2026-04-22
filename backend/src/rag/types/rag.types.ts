export type RagEvidenceItem = {
    id: string;
    documentId: number | null;
    chunkIndex: number | null;
    content: string;
    sourceType: string | null;
    sourceName: string | null;
};

export type RagQueryResponse = {
    query: string;
    answer: string;
    evidence: RagEvidenceItem[];
    retrieval: {
        limit: number;
        matchedCount: number;
    };
    generation: {
        answered: boolean;
    };
};
