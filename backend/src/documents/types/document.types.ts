export type DocumentParseStatus = 'ready' | 'stale' | 'failed';

export type DocumentIndexStatus = 'ready' | 'stale' | 'failed';

export type DocumentRecord = {
    id: number;
    file_id?: number | null;
    plain_text: string;
    source_type?: string | null;
    source_name?: string | null;
    title?: string | null;
    source_path?: string | null;
    normalized_path?: string | null;
    parser_name?: string | null;
    parser_version?: string | null;
    parse_status: DocumentParseStatus;
    index_status: DocumentIndexStatus;
    created_at: string;
    updated_at: string;
};

export type DocumentListItem = Omit<DocumentRecord, 'plain_text'>;

export type CreateDocumentResult = {
    documentId: number;
};

export type DocumentsListResponse = {
    documents: DocumentListItem[];
};

export type DocumentDetailResponse = {
    document: DocumentRecord;
};
