import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { ChunkRecord, ChunkVectorRecord } from './types/chunk.types';
import type {
    CreateDocumentResult,
    DocumentRecord,
} from './types/document.types';

@Injectable()
export class DocumentsService {
    constructor(private readonly databaseService: DatabaseService) {}

    listDocuments(): DocumentRecord[] {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                'SELECT id, content, source_path, normalized_path, created_at FROM documents ORDER BY id DESC',
            )
            .all() as DocumentRecord[];
    }

    getDocumentById(id: number): DocumentRecord {
        const database = this.databaseService.getDatabase();
        const row = database
            .prepare(
                'SELECT id, content, source_path, normalized_path, created_at FROM documents WHERE id = ?',
            )
            .get(id) as DocumentRecord | undefined;

        if (!row) {
            throw new NotFoundException(`document ${id} 不存在`);
        }

        return row;
    }

    createDocument(
        content: string,
        sourceType?: string,
        sourceName?: string | null,
        sourcePath?: string | null,
        normalizedPath?: string | null,
    ): CreateDocumentResult {
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            throw new BadRequestException('content 不能为空');
        }

        const database = this.databaseService.getDatabase();
        const result = database
            .prepare(
                'INSERT INTO documents (content, source_type, source_name, source_path, normalized_path) VALUES (?, ?, ?, ?, ?)',
            )
            .run(
                trimmedContent,
                sourceType ?? null,
                sourceName ?? null,
                sourcePath ?? null,
                normalizedPath ?? null,
            );

        return {
            documentId: Number(result.lastInsertRowid),
        };
    }

    createChunks(documentId: number, chunks: string[]): ChunkRecord[] {
        const database = this.databaseService.getDatabase();
        const statement = database.prepare(
            'INSERT INTO chunks (document_id, chunk_index, content) VALUES (?, ?, ?)',
        );

        return chunks.map((content, index) => {
            const result = statement.run(documentId, index, content);
            return {
                id: Number(result.lastInsertRowid),
                documentId,
                chunkIndex: index,
                content,
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
}
