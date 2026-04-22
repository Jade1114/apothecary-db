import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
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
                'SELECT id, content, created_at FROM documents ORDER BY id DESC',
            )
            .all() as DocumentRecord[];
    }

    getDocumentById(id: number): DocumentRecord {
        const database = this.databaseService.getDatabase();
        const row = database
            .prepare(
                'SELECT id, content, created_at FROM documents WHERE id = ?',
            )
            .get(id) as DocumentRecord | undefined;

        if (!row) {
            throw new NotFoundException(`document ${id} 不存在`);
        }

        return row;
    }

    createDocument(content: string): CreateDocumentResult {
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            throw new BadRequestException('content 不能为空');
        }

        const database = this.databaseService.getDatabase();
        const result = database
            .prepare('INSERT INTO documents (content) VALUES (?)')
            .run(trimmedContent);

        return {
            documentId: Number(result.lastInsertRowid),
        };
    }
}
