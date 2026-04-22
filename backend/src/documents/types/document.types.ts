export type DocumentRecord = {
    id: number;
    content: string;
    source_path?: string | null;
    normalized_path?: string | null;
    created_at: string;
};

export type CreateDocumentResult = {
    documentId: number;
};

export type DocumentsListResponse = {
    documents: DocumentRecord[];
};

export type DocumentDetailResponse = {
    document: DocumentRecord;
};
