export type NormalizedDocumentMetadata = {
    extension: string;
    hash: string;
    size: number;
    parser: string;
    parserVersion: string;
    generatedAt: string;
};

export type NormalizedDocument = {
    fileId: string;
    sourcePath: string;
    sourceType: 'txt' | 'md' | 'pdf' | 'docx';
    sourceName: string;
    title: string | null;
    plainText: string;
    markdownBody: string;
    metadata: NormalizedDocumentMetadata;
};
