import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { DocumentsModule } from '../documents/documents.module';
import { EmbeddingService } from '../embedding/embedding.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { ParserModule } from '../parser/parser.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { VectorModule } from '../vector/vector.module';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';
import { IngestController } from './ingest.controller';
import { IngestModule } from './ingest.module';

describe('IngestController', () => {
    let ingestController: IngestController;
    let databaseService: DatabaseService;
    let embeddingService: EmbeddingService;
    let vectorStore: VectorStore;
    let vaultPath: string;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';
        vaultPath = join(tmpdir(), `apothecary-vault-${Date.now()}`);
        process.env.APOTHECARY_VAULT_PATH = vaultPath;
        await mkdir(vaultPath, { recursive: true });

        const app: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule,
                DatabaseModule,
                DocumentsModule,
                ProfilesModule,
                ParserModule,
                EmbeddingModule,
                VectorModule,
                IngestModule,
            ],
        }).compile();

        databaseService = app.get(DatabaseService);
        databaseService.onModuleInit();
        ingestController = app.get<IngestController>(IngestController);
        embeddingService = app.get(EmbeddingService);
        vectorStore = app.get<VectorStore>(VECTOR_STORE);

        jest.spyOn(embeddingService, 'embedText').mockResolvedValue([0.1, 0.2, 0.3]);
        jest.spyOn(vectorStore, 'upsertPoints').mockResolvedValue();
        jest.spyOn(vectorStore, 'deleteByDocumentId').mockResolvedValue();
    });

    it('should ingest content and return chunk count', async () => {
        const result = await ingestController.ingest({
            content: '第一段资料。\n\n第二段资料。',
            sourceType: 'text',
            sourceName: 'manual',
        });

        expect(result).toEqual({
            success: true,
            documentId: 1,
            chunkCount: 2,
            sourceType: 'text',
            sourceName: 'manual',
            indexing: {
                embeddingReady: true,
                vectorReady: true,
                indexedPoints: 2,
            },
        });
    });

    it('should ingest a vault markdown file and persist normalized document with file_id', async () => {
        const filePath = join(vaultPath, 'notes.md');
        await writeFile(filePath, '# 文件标题\n\n第一段资料。\n\n第二段资料。', 'utf8');

        const result = await ingestController.ingestFile({
            filePath: 'notes.md',
        });

        expect(result.success).toBe(true);
        expect(result.sourceType).toBe('md');
        expect(result.sourceName).toBe('notes.md');
        expect(result.sourcePath).toBe(filePath);
        expect(result.title).toBe('文件标题');

        const normalizedContent = await readFile(result.normalizedPath, 'utf8');
        expect(normalizedContent).toContain('source_type: md');
        expect(normalizedContent).toContain('# 文件标题');

        const database = databaseService.getDatabase();
        const document = database
            .prepare('SELECT id, file_id FROM documents WHERE id = ?')
            .get(result.documentId) as { id: number; file_id: number | null };
        const file = database
            .prepare('SELECT id, path, name, extension, size, status FROM files WHERE id = ?')
            .get(document.file_id) as {
                id: number;
                path: string;
                name: string;
                extension: string;
                size: number;
                status: string;
            };

        expect(document.file_id).toBeTruthy();
        expect(file.path).toBe(filePath);
        expect(file.name).toBe('notes.md');
        expect(file.extension).toBe('md');
        expect(file.size).toBeGreaterThan(0);
        expect(file.status).toBe('active');
    });

    it('should detect unchanged files and avoid duplicate documents on repeated scan', async () => {
        const filePath = join(vaultPath, 'alpha.md');
        await writeFile(filePath, '# Alpha\n\n第一段', 'utf8');

        await ingestController.scanVault();
        const embedCallsAfterFirstScan = (embeddingService.embedText as jest.Mock).mock.calls.length;
        const upsertCallsAfterFirstScan = (vectorStore.upsertPoints as jest.Mock).mock.calls.length;

        await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const fileCount = database.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number };
        const documentCount = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE source_path = ?')
            .get(filePath) as { count: number };

        expect(fileCount.count).toBe(1);
        expect(documentCount.count).toBe(1);
        expect((embeddingService.embedText as jest.Mock).mock.calls.length).toBe(embedCallsAfterFirstScan);
        expect((vectorStore.upsertPoints as jest.Mock).mock.calls.length).toBe(upsertCallsAfterFirstScan);
    });

    it('should detect changed files and replace document content', async () => {
        const filePath = join(vaultPath, 'beta.txt');
        await writeFile(filePath, '旧内容', 'utf8');
        await ingestController.scanVault();

        await writeFile(filePath, '新内容\n\n第二段', 'utf8');
        await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const file = database
            .prepare('SELECT hash, status FROM files WHERE path = ?')
            .get(filePath) as { hash: string; status: string };
        const document = database
            .prepare('SELECT content FROM documents WHERE file_id = (SELECT id FROM files WHERE path = ?)')
            .get(filePath) as { content: string };
        const documentCount = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE file_id = (SELECT id FROM files WHERE path = ?)')
            .get(filePath) as { count: number };

        expect(file.hash).toBeTruthy();
        expect(file.status).toBe('active');
        expect(document.content).toContain('新内容');
        expect(documentCount.count).toBe(1);
        expect(vectorStore.deleteByDocumentId).toHaveBeenCalledTimes(1);
    });

    it('should scan vault and import only supported files', async () => {
        await mkdir(join(vaultPath, 'nested'), { recursive: true });
        await mkdir(join(vaultPath, '.apothecary'), { recursive: true });
        await writeFile(join(vaultPath, 'alpha.md'), '# Alpha\n\n第一段', 'utf8');
        await writeFile(join(vaultPath, 'beta.txt'), 'Beta 内容', 'utf8');
        await writeFile(join(vaultPath, 'ignore.json'), '{"a":1}', 'utf8');
        await writeFile(join(vaultPath, 'nested', 'gamma.md'), '# Gamma\n\n第二段', 'utf8');
        await writeFile(join(vaultPath, '.apothecary', 'hidden.md'), '# Hidden', 'utf8');

        const result = await ingestController.scanVault();

        expect(result.vaultPath).toBe(vaultPath);
        expect(result.scannedCount).toBe(3);
        expect(result.importedCount).toBe(3);
        expect(result.failedCount).toBe(0);
        expect(result.items).toHaveLength(3);
        expect(result.items.map((item) => item.filePath)).toEqual([
            join(vaultPath, 'alpha.md'),
            join(vaultPath, 'beta.txt'),
            join(vaultPath, 'nested', 'gamma.md'),
        ]);
    });
});
