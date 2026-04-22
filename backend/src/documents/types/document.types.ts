export type DocumentRecord = {
    id: number;
    content: string;
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
