export type DocumentRecord = {
    id: number;
    file_id?: number | null;
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
