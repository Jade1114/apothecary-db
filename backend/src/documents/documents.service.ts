import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type DocumentRecord = {
  id: number;
  content: string;
  created_at: string;
};

@Injectable()
export class DocumentsService {
  constructor(private readonly databaseService: DatabaseService) {}

  listDocuments(): DocumentRecord[] {
    const database = this.databaseService.getDatabase();
    return database
      .prepare('SELECT id, content, created_at FROM documents ORDER BY id DESC')
      .all() as DocumentRecord[];
  }

  createDocument(content: string): { documentId: number } {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new BadRequestException('content 不能为空');
    }

    const database = this.databaseService.getDatabase();
    const result = database.prepare('INSERT INTO documents (content) VALUES (?)').run(trimmedContent);

    return {
      documentId: Number(result.lastInsertRowid),
    };
  }
}
