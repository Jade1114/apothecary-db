import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
    let documentsService: DocumentsService;
    let databaseService: DatabaseService;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, DatabaseModule],
            providers: [DocumentsService],
        }).compile();

        databaseService = module.get(DatabaseService);
        databaseService.onModuleInit();
        documentsService = module.get(DocumentsService);
    });

    it('should create and read a document by id', () => {
        const database = databaseService.getDatabase();
        const fileInsert = database
            .prepare(
                "INSERT INTO files (path, name, extension, kind, size, hash, status, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)",
            )
            .run('/tmp/spec.md', 'spec.md', 'md', 'markdown', 12, 'hash-1');
        const fileId = Number(fileInsert.lastInsertRowid);

        const created = documentsService.createDocument('测试资料', 'note', 'spec', null, null, fileId);
        const document = documentsService.getDocumentById(created.documentId);

        expect(document.id).toBe(created.documentId);
        expect(document.file_id).toBe(fileId);
        expect(document.content).toBe('测试资料');
    });

    it('should create chunks and chunk vector mappings', () => {
        const created = documentsService.createDocument('第一段\n\n第二段', 'note', 'chunks');
        const chunks = documentsService.createChunks(created.documentId, ['第一段', '第二段']);
        const vectorRecords = documentsService.createChunkVectorRecords([
            {
                chunkId: chunks[0].id,
                vectorId: 'vec-1',
                provider: 'sqlite-vec',
                dimension: 3,
            },
        ]);

        expect(chunks).toHaveLength(2);
        expect(chunks[0].chunkIndex).toBe(0);
        expect(vectorRecords[0].vectorId).toBe('vec-1');
        expect(vectorRecords[0].dimension).toBe(3);
    });
});
