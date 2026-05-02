import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ChunkRecord, ChunkVectorRecord } from './types/chunk.types';
import type {
    CreateDocumentResult,
    DocumentIndexStatus,
    DocumentListItem,
    DocumentParseStatus,
    DocumentRecord,
} from './types/document.types';

@Injectable()
export class DocumentsService {
    constructor(private readonly databaseService: DatabaseService) {}

    listDocuments(): DocumentListItem[] {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                `
                SELECT
                    documents.id,
                    documents.file_id,
                    documents.source_type,
                    documents.source_name,
                    documents.title,
                    documents.source_path,
                    documents.normalized_path,
                    documents.parser_name,
                    documents.parser_version,
                    documents.parse_status,
                    documents.index_status,
                    documents.created_at,
                    documents.updated_at
                FROM documents
                LEFT JOIN files ON files.id = documents.file_id
                WHERE documents.parse_status IN ('ready', 'stale')
                  AND documents.index_status IN ('ready', 'stale')
                  AND (documents.file_id IS NULL OR files.status != 'deleted')
                ORDER BY documents.id DESC
                `,
            )
            .all() as DocumentListItem[];
    }

    getDocumentById(id: number): DocumentRecord {
        const database = this.databaseService.getDatabase();
        const row = database
            .prepare(
                `
                SELECT
                    documents.id,
                    documents.file_id,
                    documents.plain_text,
                    documents.source_type,
                    documents.source_name,
                    documents.title,
                    documents.source_path,
                    documents.normalized_path,
                    documents.parser_name,
                    documents.parser_version,
                    documents.parse_status,
                    documents.index_status,
                    documents.created_at,
                    documents.updated_at
                FROM documents
                LEFT JOIN files ON files.id = documents.file_id
                WHERE documents.id = ?
                  AND documents.parse_status IN ('ready', 'stale')
                  AND documents.index_status IN ('ready', 'stale')
                  AND (documents.file_id IS NULL OR files.status != 'deleted')
                `,
            )
            .get(id) as DocumentRecord | undefined;

        if (!row) {
            throw new NotFoundException(`document ${id} 不存在`);
        }

        return row;
    }

    findDocumentByFileId(fileId: number): DocumentRecord | null {
        return this.listDocumentsByFileId(fileId)[0] ?? null;
    }

    listDocumentsByFileId(fileId: number): DocumentRecord[] {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                `
                SELECT
                    id,
                    file_id,
                    plain_text,
                    source_type,
                    source_name,
                    title,
                    source_path,
                    normalized_path,
                    parser_name,
                    parser_version,
                    parse_status,
                    index_status,
                    created_at,
                    updated_at
                FROM documents
                WHERE file_id = ?
                ORDER BY id ASC
                `,
            )
            .all(fileId) as DocumentRecord[];
    }

    countDocumentsByFileId(fileId: number): number {
        const database = this.databaseService.getDatabase();
        const row = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE file_id = ?')
            .get(fileId) as { count: number };

        return Number(row.count);
    }

    createDocument(
        plainText: string,
        sourceType?: string,
        sourceName?: string | null,
        sourcePath?: string | null,
        normalizedPath?: string | null,
        fileId?: number | null,
        state?: {
            title?: string | null;
            parserName?: string | null;
            parserVersion?: string | null;
            parseStatus?: DocumentParseStatus;
            indexStatus?: DocumentIndexStatus;
        },
    ): CreateDocumentResult {
        const trimmedPlainText = plainText.trim();
        if (!trimmedPlainText) {
            throw new BadRequestException('content 不能为空');
        }

        const database = this.databaseService.getDatabase();
        const result = database
            .prepare(
                `
                INSERT INTO documents (
                    file_id,
                    plain_text,
                    source_type,
                    source_name,
                    title,
                    source_path,
                    normalized_path,
                    parser_name,
                    parser_version,
                    parse_status,
                    index_status,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `,
            )
            .run(
                fileId ?? null,
                trimmedPlainText,
                sourceType ?? null,
                sourceName ?? null,
                state?.title ?? null,
                sourcePath ?? null,
                normalizedPath ?? null,
                state?.parserName ?? null,
                state?.parserVersion ?? null,
                state?.parseStatus ?? 'ready',
                state?.indexStatus ?? 'ready',
            );

        return {
            documentId: Number(result.lastInsertRowid),
        };
    }

    updateDocument(
        documentId: number,
        input: {
            plainText: string;
            sourceType?: string;
            sourceName?: string | null;
            title?: string | null;
            sourcePath?: string | null;
            normalizedPath?: string | null;
            parserName?: string | null;
            parserVersion?: string | null;
            parseStatus: DocumentParseStatus;
            indexStatus: DocumentIndexStatus;
        },
    ): void {
        const trimmedPlainText = input.plainText.trim();
        if (!trimmedPlainText) {
            throw new BadRequestException('content 不能为空');
        }

        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE documents
                SET
                    plain_text = ?,
                    source_type = ?,
                    source_name = ?,
                    title = ?,
                    source_path = ?,
                    normalized_path = ?,
                    parser_name = ?,
                    parser_version = ?,
                    parse_status = ?,
                    index_status = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
            )
            .run(
                trimmedPlainText,
                input.sourceType ?? null,
                input.sourceName ?? null,
                input.title ?? null,
                input.sourcePath ?? null,
                input.normalizedPath ?? null,
                input.parserName ?? null,
                input.parserVersion ?? null,
                input.parseStatus,
                input.indexStatus,
                documentId,
            );
    }

    setDocumentStatuses(
        documentId: number,
        parseStatus: DocumentParseStatus,
        indexStatus: DocumentIndexStatus,
    ): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE documents
                SET parse_status = ?, index_status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
            )
            .run(parseStatus, indexStatus, documentId);
    }

    countChunks(documentId: number): number {
        const database = this.databaseService.getDatabase();
        const row = database
            .prepare('SELECT COUNT(*) AS count FROM chunks WHERE document_id = ?')
            .get(documentId) as { count: number };

        return Number(row.count);
    }

    countChunkVectorRecords(documentId: number): number {
        const database = this.databaseService.getDatabase();
        const row = database
            .prepare(
                `
                SELECT COUNT(*) AS count
                FROM chunk_vectors
                WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)
                `,
            )
            .get(documentId) as { count: number };

        return Number(row.count);
    }

    deleteDocumentArtifacts(documentId: number): void {
        const database = this.databaseService.getDatabase();
        database.prepare('DELETE FROM profiles WHERE document_id = ?').run(documentId);
        database
            .prepare(
                'DELETE FROM chunk_vectors WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)',
            )
            .run(documentId);
        database.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
    }

    deleteDocumentCascade(documentId: number): void {
        const database = this.databaseService.getDatabase();
        this.deleteDocumentArtifacts(documentId);
        database.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
    }

    createChunks(documentId: number, chunks: string[]): ChunkRecord[] {
        const database = this.databaseService.getDatabase();
        const statement = database.prepare(
            'INSERT INTO chunks (document_id, chunk_index, text, token_count) VALUES (?, ?, ?, ?)',
        );

        return chunks.map((text, index) => {
            const tokenCount = this.estimateTokenCount(text);
            const result = statement.run(documentId, index, text, tokenCount);
            return {
                id: Number(result.lastInsertRowid),
                documentId,
                chunkIndex: index,
                text,
                tokenCount,
                createdAt: '',
            };
        });
    }

    createChunkVectorRecords(
        records: Array<Omit<ChunkVectorRecord, 'createdAt'>>,
    ): ChunkVectorRecord[] {
        const database = this.databaseService.getDatabase();
        const statement = database.prepare(
            'INSERT INTO chunk_vectors (chunk_id, vector_id, provider, dimension) VALUES (?, ?, ?, ?)',
        );

        return records.map((record) => {
            statement.run(record.chunkId, record.vectorId, record.provider, record.dimension);
            return {
                ...record,
                createdAt: '',
            };
        });
    }

    private estimateTokenCount(text: string): number {
        return text.trim().split(/\s+/).filter(Boolean).length;
    }
}
