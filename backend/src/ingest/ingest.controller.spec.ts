import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentsService } from '../documents/documents.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { FilesService } from '../files/files.service';
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
    let documentsService: DocumentsService;
    let embeddingService: EmbeddingService;
    let filesService: FilesService;
    let vectorStore: VectorStore;
    let vaultPath: string;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';
        process.env.VECTOR_DIMENSION = '3';
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
        documentsService = app.get(DocumentsService);
        embeddingService = app.get(EmbeddingService);
        filesService = app.get(FilesService);
        vectorStore = app.get<VectorStore>(VECTOR_STORE);

        const upsertPoints = vectorStore.upsertPoints.bind(vectorStore);
        const deleteByDocumentId = vectorStore.deleteByDocumentId.bind(vectorStore);
        jest.spyOn(embeddingService, 'embedText').mockResolvedValue([0.1, 0.2, 0.3]);
        jest.spyOn(vectorStore, 'upsertPoints').mockImplementation((points) => upsertPoints(points));
        jest.spyOn(vectorStore, 'deleteByDocumentId').mockImplementation((documentId) =>
            deleteByDocumentId(documentId),
        );
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
            .prepare(
                `
                SELECT
                    id,
                    file_id,
                    title,
                    parser_name,
                    parser_version,
                    parse_status,
                    index_status
                FROM documents
                WHERE id = ?
                `,
            )
            .get(result.documentId) as {
                id: number;
                file_id: number | null;
                title: string | null;
                parser_name: string | null;
                parser_version: string | null;
                parse_status: string;
                index_status: string;
            };
        const file = database
            .prepare(
                `
                SELECT
                    id,
                    path,
                    name,
                    extension,
                    size,
                    hash,
                    observed_hash,
                    indexed_hash,
                    observed_at,
                    indexed_at,
                    status,
                    last_normalized_path,
                    normalized_retained_at
                FROM files
                WHERE id = ?
                `,
            )
            .get(document.file_id) as {
                id: number;
                path: string;
                name: string;
                extension: string;
                size: number;
                hash: string | null;
                observed_hash: string | null;
                indexed_hash: string | null;
                observed_at: string | null;
                indexed_at: string | null;
                status: string;
                last_normalized_path: string | null;
                normalized_retained_at: string | null;
            };

        expect(document.file_id).toBeTruthy();
        expect(document.title).toBe('文件标题');
        expect(document.parser_name).toBe('markdown-file-parser');
        expect(document.parser_version).toBe('v1');
        expect(document.parse_status).toBe('ready');
        expect(document.index_status).toBe('ready');
        expect(file.path).toBe(filePath);
        expect(file.name).toBe('notes.md');
        expect(file.extension).toBe('md');
        expect(file.size).toBeGreaterThan(0);
        expect(file.hash).toBeTruthy();
        expect(file.observed_hash).toBe(file.hash);
        expect(file.indexed_hash).toBe(file.hash);
        expect(file.observed_at).toBeTruthy();
        expect(file.indexed_at).toBeTruthy();
        expect(file.status).toBe('active');
        expect(file.last_normalized_path).toBe(result.normalizedPath);
        expect(file.normalized_retained_at).toBeNull();

        const jobs = database
            .prepare('SELECT job_type, status FROM sync_jobs WHERE file_id = ? ORDER BY id ASC')
            .all(document.file_id) as Array<{ job_type: string; status: string }>;
        expect(jobs).toEqual([
            { job_type: 'parse', status: 'succeeded' },
            { job_type: 'index', status: 'succeeded' },
        ]);

        const chunk = database
            .prepare('SELECT text, token_count FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC LIMIT 1')
            .get(result.documentId) as { text: string; token_count: number };
        expect(chunk.text).toContain('文件标题');
        expect(chunk.token_count).toBeGreaterThan(0);
    });

    it('should detect unchanged files and avoid duplicate documents on repeated scan', async () => {
        const filePath = join(vaultPath, 'alpha.md');
        await writeFile(filePath, '# Alpha\n\n第一段', 'utf8');

        await ingestController.scanVault();
        const embedCallsAfterFirstScan = (embeddingService.embedText as jest.Mock).mock.calls.length;
        const upsertCallsAfterFirstScan = (vectorStore.upsertPoints as jest.Mock).mock.calls.length;

        const secondScan = await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const fileCount = database.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number };
        const documentCount = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE source_path = ?')
            .get(filePath) as { count: number };

        expect(fileCount.count).toBe(1);
        expect(documentCount.count).toBe(1);
        expect((embeddingService.embedText as jest.Mock).mock.calls.length).toBe(embedCallsAfterFirstScan);
        expect((vectorStore.upsertPoints as jest.Mock).mock.calls.length).toBe(upsertCallsAfterFirstScan);
        expect(secondScan.importedCount).toBe(0);
        expect(secondScan.skippedCount).toBe(1);
        expect(secondScan.deletedCount).toBe(0);
        expect(secondScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 0,
            unchangedCount: 1,
            deletedCount: 0,
        });
        expect(secondScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'unchanged',
                action: 'skipped',
                success: true,
            }),
        ]);
    });

    it('should serialize scan with an in-flight file ingest for the same file', async () => {
        const relativePath = 'locked.txt';
        const filePath = join(vaultPath, relativePath);
        await writeFile(filePath, '锁定内容', 'utf8');

        let releaseEmbedding!: () => void;
        let resolveEmbeddingStarted!: () => void;
        let didResolveEmbeddingStarted = false;
        const embeddingGate = new Promise<void>((resolve) => {
            releaseEmbedding = resolve;
        });
        const embeddingStarted = new Promise<void>((resolve) => {
            resolveEmbeddingStarted = resolve;
        });
        (embeddingService.embedText as jest.Mock).mockImplementation(async () => {
            if (!didResolveEmbeddingStarted) {
                didResolveEmbeddingStarted = true;
                resolveEmbeddingStarted();
            }
            await embeddingGate;
            return [0.1, 0.2, 0.3];
        });

        const ingest = ingestController.ingestFile({ filePath: relativePath });
        await embeddingStarted;
        const scan = ingestController.scanVault();

        releaseEmbedding();
        const [ingestResult, scanResult] = await Promise.all([ingest, scan]);

        const database = databaseService.getDatabase();
        const file = database.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as {
            id: number;
        };
        const fileJobs = database
            .prepare(
                'SELECT job_type, status, error_message FROM sync_jobs WHERE file_id = ? ORDER BY id ASC',
            )
            .all(file.id) as Array<{
                job_type: string;
                status: string;
                error_message: string | null;
            }>;
        const interruptedCount = database
            .prepare("SELECT COUNT(*) AS count FROM sync_jobs WHERE error_message = 'interrupted'")
            .get() as { count: number };

        expect(ingestResult.success).toBe(true);
        expect(scanResult.importedCount).toBe(0);
        expect(scanResult.skippedCount).toBe(1);
        expect((embeddingService.embedText as jest.Mock).mock.calls).toHaveLength(1);
        expect(fileJobs).toEqual([
            { job_type: 'parse', status: 'succeeded', error_message: null },
            { job_type: 'index', status: 'succeeded', error_message: null },
        ]);
        expect(interruptedCount.count).toBe(0);
        expect(scanResult.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'unchanged',
                action: 'skipped',
                success: true,
            }),
        ]);
    });

    it('should detect changed files and replace document content', async () => {
        const filePath = join(vaultPath, 'beta.txt');
        await writeFile(filePath, '旧内容', 'utf8');
        await ingestController.scanVault();

        const originalDocument = databaseService
            .getDatabase()
            .prepare('SELECT id FROM documents WHERE file_id = (SELECT id FROM files WHERE path = ?)')
            .get(filePath) as { id: number };

        await writeFile(filePath, '新内容\n\n第二段', 'utf8');
        const secondScan = await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const file = database
            .prepare('SELECT hash, observed_hash, indexed_hash, status FROM files WHERE path = ?')
            .get(filePath) as {
                hash: string;
                observed_hash: string;
                indexed_hash: string;
                status: string;
            };
        const document = database
            .prepare('SELECT id, plain_text FROM documents WHERE file_id = (SELECT id FROM files WHERE path = ?)')
            .get(filePath) as { id: number; plain_text: string };
        const documentCount = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE file_id = (SELECT id FROM files WHERE path = ?)')
            .get(filePath) as { count: number };
        const chunkCount = database
            .prepare('SELECT COUNT(*) AS count FROM chunks WHERE document_id = ?')
            .get(document.id) as { count: number };

        expect(file.hash).toBeTruthy();
        expect(file.observed_hash).toBe(file.hash);
        expect(file.indexed_hash).toBe(file.hash);
        expect(file.status).toBe('active');
        expect(document.id).toBe(originalDocument.id);
        expect(document.plain_text).toContain('新内容');
        expect(documentCount.count).toBe(1);
        expect(chunkCount.count).toBe(2);
        expect(vectorStore.deleteByDocumentId).toHaveBeenCalledTimes(1);
        expect(secondScan.importedCount).toBe(1);
        expect(secondScan.skippedCount).toBe(0);
        expect(secondScan.deletedCount).toBe(0);
        expect(secondScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 1,
            unchangedCount: 0,
            deletedCount: 0,
        });
        expect(secondScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'changed',
                action: 'indexed',
                success: true,
            }),
        ]);
    });

    it('should delete online artifacts when a vault file disappears', async () => {
        const filePath = join(vaultPath, 'gone.md');
        await writeFile(filePath, '# Gone\n\n第一段', 'utf8');
        await ingestController.scanVault();

        const document = databaseService
            .getDatabase()
            .prepare('SELECT id, file_id, normalized_path FROM documents WHERE source_path = ?')
            .get(filePath) as { id: number; file_id: number; normalized_path: string };
        expect(
            await vectorStore.search({
                queryVector: [0.1, 0.2, 0.3],
                limit: 5,
            }),
        ).toHaveLength(2);

        await unlink(filePath);
        const deleteScan = await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const file = database
            .prepare(
                `
                SELECT
                    status,
                    deleted_at,
                    last_normalized_path,
                    normalized_retained_at
                FROM files
                WHERE id = ?
                `,
            )
            .get(document.file_id) as {
                status: string;
                deleted_at: string | null;
                last_normalized_path: string | null;
                normalized_retained_at: string | null;
            };
        const documentCount = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE file_id = ?')
            .get(document.file_id) as { count: number };
        const chunkEmbeddingCount = database.prepare('SELECT COUNT(*) AS count FROM chunk_embeddings').get() as {
            count: number;
        };
        const deleteJobs = database
            .prepare("SELECT status FROM sync_jobs WHERE file_id = ? AND job_type = 'delete'")
            .all(document.file_id) as Array<{ status: string }>;

        expect(file.status).toBe('deleted');
        expect(file.deleted_at).toBeTruthy();
        expect(file.last_normalized_path).toBe(document.normalized_path);
        expect(file.normalized_retained_at).toBeTruthy();
        await expect(readFile(document.normalized_path, 'utf8')).resolves.toContain('source_name: gone.md');
        expect(documentCount.count).toBe(0);
        expect(chunkEmbeddingCount.count).toBe(0);
        expect(documentsService.listDocuments()).toEqual([]);
        expect(
            await vectorStore.search({
                queryVector: [0.1, 0.2, 0.3],
                limit: 5,
            }),
        ).toEqual([]);
        expect(deleteJobs.at(-1)?.status).toBe('succeeded');
        expect(deleteScan.scannedCount).toBe(0);
        expect(deleteScan.reconciledCount).toBe(1);
        expect(deleteScan.importedCount).toBe(0);
        expect(deleteScan.skippedCount).toBe(0);
        expect(deleteScan.deletedCount).toBe(1);
        expect(deleteScan.failedCount).toBe(0);
        expect(deleteScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 0,
            unchangedCount: 0,
            deletedCount: 1,
        });
        expect(deleteScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'deleted',
                action: 'deleted',
                success: true,
            }),
        ]);
    });

    it('should re-index a file when it reappears at the same path after deletion', async () => {
        const filePath = join(vaultPath, 'revived.md');
        await writeFile(filePath, '# Revived\n\n旧内容', 'utf8');
        await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const originalFile = database
            .prepare('SELECT id, indexed_hash FROM files WHERE path = ?')
            .get(filePath) as { id: number; indexed_hash: string };
        const originalDocument = database
            .prepare('SELECT id FROM documents WHERE file_id = ?')
            .get(originalFile.id) as { id: number };
        const embedCallsAfterFirstScan = (embeddingService.embedText as jest.Mock).mock.calls.length;

        await unlink(filePath);
        await ingestController.scanVault();

        const deletedFile = database
            .prepare('SELECT status, deleted_at FROM files WHERE id = ?')
            .get(originalFile.id) as { status: string; deleted_at: string | null };
        const deletedDocumentCount = database
            .prepare('SELECT COUNT(*) AS count FROM documents WHERE file_id = ?')
            .get(originalFile.id) as { count: number };
        expect(deletedFile.status).toBe('deleted');
        expect(deletedFile.deleted_at).toBeTruthy();
        expect(deletedDocumentCount.count).toBe(0);

        await writeFile(filePath, '# Revived\n\n新内容', 'utf8');
        const restoreScan = await ingestController.scanVault();

        const restoredFile = database
            .prepare(
                'SELECT id, hash, observed_hash, indexed_hash, status, deleted_at, normalized_retained_at FROM files WHERE path = ?',
            )
            .get(filePath) as {
                id: number;
                hash: string;
                observed_hash: string;
                indexed_hash: string;
                status: string;
                deleted_at: string | null;
                normalized_retained_at: string | null;
            };
        const restoredDocument = database
            .prepare('SELECT id, plain_text FROM documents WHERE file_id = ?')
            .get(originalFile.id) as { id: number; plain_text: string };

        expect(restoredFile.id).toBe(originalFile.id);
        expect(restoredFile.status).toBe('active');
        expect(restoredFile.deleted_at).toBeNull();
        expect(restoredFile.normalized_retained_at).toBeNull();
        expect(restoredFile.hash).toBe(restoredFile.observed_hash);
        expect(restoredFile.indexed_hash).toBe(restoredFile.observed_hash);
        expect(restoredFile.indexed_hash).not.toBe(originalFile.indexed_hash);
        expect(restoredDocument.id).not.toBe(originalDocument.id);
        expect(restoredDocument.plain_text).toContain('新内容');
        expect((embeddingService.embedText as jest.Mock).mock.calls.length).toBeGreaterThan(
            embedCallsAfterFirstScan,
        );
        expect(restoreScan.importedCount).toBe(1);
        expect(restoreScan.skippedCount).toBe(0);
        expect(restoreScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 1,
            unchangedCount: 0,
            deletedCount: 0,
        });
        expect(restoreScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'changed',
                action: 'indexed',
                success: true,
            }),
        ]);
    });

    it('should preserve the last indexed version when re-indexing fails', async () => {
        const filePath = join(vaultPath, 'resilient.txt');
        await writeFile(filePath, '旧内容', 'utf8');
        await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const before = database
            .prepare('SELECT id, plain_text FROM documents WHERE source_path = ?')
            .get(filePath) as { id: number; plain_text: string };

        await writeFile(filePath, '新内容\n\n第二段', 'utf8');
        (vectorStore.upsertPoints as jest.Mock).mockRejectedValueOnce(new Error('vector write failed'));

        const result = await ingestController.scanVault();
        const file = database
            .prepare('SELECT id, hash, observed_hash, indexed_hash, status FROM files WHERE path = ?')
            .get(filePath) as {
                id: number;
                hash: string;
                observed_hash: string;
                indexed_hash: string;
                status: string;
            };
        const after = database
            .prepare('SELECT id, plain_text, parse_status, index_status FROM documents WHERE source_path = ?')
            .get(filePath) as {
                id: number;
                plain_text: string;
                parse_status: string;
                index_status: string;
            };
        const jobs = database
            .prepare(
                "SELECT job_type, status, error_message FROM sync_jobs WHERE file_id = ? AND job_type = 'index' ORDER BY id ASC",
            )
            .all(file.id) as Array<{ job_type: string; status: string; error_message: string | null }>;

        expect(result.failedCount).toBe(1);
        expect(result.importedCount).toBe(0);
        expect(result.skippedCount).toBe(0);
        expect(result.deletedCount).toBe(0);
        expect(result.breakdown).toEqual({
            newCount: 0,
            changedCount: 1,
            unchangedCount: 0,
            deletedCount: 0,
        });
        expect(result.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'changed',
                action: 'indexed',
                success: false,
                error: 'vector write failed',
            }),
        ]);
        expect(file.status).toBe('error');
        expect(file.hash).toBe(file.indexed_hash);
        expect(file.observed_hash).not.toBe(file.indexed_hash);
        expect(after.id).toBe(before.id);
        expect(after.plain_text).toBe(before.plain_text);
        expect(after.parse_status).toBe('stale');
        expect(after.index_status).toBe('stale');
        expect(
            await vectorStore.search({
                queryVector: [0.1, 0.2, 0.3],
                limit: 5,
            }),
        ).toEqual([
            expect.objectContaining({
                payload: expect.objectContaining({
                    documentId: before.id,
                    content: '旧内容',
                }),
            }),
        ]);
        expect(jobs.at(-1)).toEqual({
            job_type: 'index',
            status: 'failed',
            error_message: 'vector write failed',
        });

        await ingestController.scanVault();

        const repaired = database
            .prepare('SELECT id, plain_text FROM documents WHERE source_path = ?')
            .get(filePath) as { id: number; plain_text: string };
        const repairedFile = database
            .prepare('SELECT hash, observed_hash, indexed_hash, status FROM files WHERE id = ?')
            .get(file.id) as {
                hash: string;
                observed_hash: string;
                indexed_hash: string;
                status: string;
            };

        expect(repaired.id).toBe(before.id);
        expect(repaired.plain_text).toContain('新内容');
        expect(repairedFile.status).toBe('active');
        expect(repairedFile.hash).toBe(repairedFile.observed_hash);
        expect(repairedFile.indexed_hash).toBe(repairedFile.observed_hash);
    });

    it('should repair an unchanged file when vector rows are missing', async () => {
        const filePath = join(vaultPath, 'repair.md');
        await writeFile(filePath, '# Repair\n\n第一段', 'utf8');
        await ingestController.scanVault();

        const embedCallsAfterFirstScan = (embeddingService.embedText as jest.Mock).mock.calls.length;
        databaseService.getDatabase().exec('DELETE FROM chunk_embeddings');

        const repairScan = await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const document = database
            .prepare('SELECT id FROM documents WHERE source_path = ?')
            .get(filePath) as { id: number };
        const vectorRowCount = database.prepare('SELECT COUNT(*) AS count FROM chunk_embeddings').get() as {
            count: number;
        };

        expect((embeddingService.embedText as jest.Mock).mock.calls.length).toBeGreaterThan(
            embedCallsAfterFirstScan,
        );
        expect(vectorRowCount.count).toBeGreaterThan(0);
        expect(repairScan.importedCount).toBe(1);
        expect(repairScan.skippedCount).toBe(0);
        expect(repairScan.deletedCount).toBe(0);
        expect(repairScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 0,
            unchangedCount: 1,
            deletedCount: 0,
        });
        expect(repairScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'unchanged',
                action: 'indexed',
                success: true,
            }),
        ]);
        expect(
            await vectorStore.search({
                queryVector: [0.1, 0.2, 0.3],
                limit: 5,
                documentId: document.id,
            }),
        ).toHaveLength(2);
    });

    it('should repair a file observed before an interrupted update', async () => {
        const filePath = join(vaultPath, 'half-finished.md');
        await writeFile(filePath, '# Half\n\n旧内容', 'utf8');
        await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const originalFile = database
            .prepare('SELECT id, indexed_hash FROM files WHERE path = ?')
            .get(filePath) as { id: number; indexed_hash: string };
        const originalDocument = database
            .prepare('SELECT id, plain_text FROM documents WHERE file_id = ?')
            .get(originalFile.id) as { id: number; plain_text: string };
        const embedCallsAfterFirstScan = (embeddingService.embedText as jest.Mock).mock.calls.length;

        await writeFile(filePath, '# Half\n\n新内容\n\n第二段', 'utf8');
        const registration = await filesService.registerFile('half-finished.md');
        const interruptedFile = database
            .prepare('SELECT observed_hash, indexed_hash, status FROM files WHERE id = ?')
            .get(originalFile.id) as {
                observed_hash: string;
                indexed_hash: string;
                status: string;
            };
        const runningJobId = Number(
            database
                .prepare(
                    "INSERT INTO sync_jobs (file_id, job_type, status, updated_at) VALUES (?, 'parse', 'running', CURRENT_TIMESTAMP)",
                )
                .run(originalFile.id).lastInsertRowid,
        );

        expect(registration.shouldProcess).toBe(true);
        expect(registration.reason).toBe('changed');
        expect(interruptedFile.status).toBe('error');
        expect(interruptedFile.indexed_hash).toBe(originalFile.indexed_hash);
        expect(interruptedFile.observed_hash).not.toBe(interruptedFile.indexed_hash);

        const repairScan = await ingestController.scanVault();
        const interruptedJob = database
            .prepare('SELECT status, error_message FROM sync_jobs WHERE id = ?')
            .get(runningJobId) as { status: string; error_message: string | null };
        const repairedFile = database
            .prepare('SELECT hash, observed_hash, indexed_hash, status FROM files WHERE id = ?')
            .get(originalFile.id) as {
                hash: string;
                observed_hash: string;
                indexed_hash: string;
                status: string;
            };
        const repairedDocument = database
            .prepare('SELECT id, plain_text FROM documents WHERE file_id = ?')
            .get(originalFile.id) as { id: number; plain_text: string };

        expect(interruptedJob).toEqual({
            status: 'failed',
            error_message: 'interrupted',
        });
        expect(repairedFile.status).toBe('active');
        expect(repairedFile.hash).toBe(repairedFile.observed_hash);
        expect(repairedFile.indexed_hash).toBe(repairedFile.observed_hash);
        expect(repairedDocument.id).toBe(originalDocument.id);
        expect(repairedDocument.plain_text).not.toBe(originalDocument.plain_text);
        expect(repairedDocument.plain_text).toContain('新内容');
        expect((embeddingService.embedText as jest.Mock).mock.calls.length).toBeGreaterThan(
            embedCallsAfterFirstScan,
        );
        expect(repairScan.importedCount).toBe(1);
        expect(repairScan.skippedCount).toBe(0);
        expect(repairScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 1,
            unchangedCount: 0,
            deletedCount: 0,
        });
        expect(repairScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'changed',
                action: 'indexed',
                success: true,
            }),
        ]);
    });

    it('should mark interrupted running jobs and repair affected files on scan', async () => {
        const filePath = join(vaultPath, 'interrupted.md');
        await writeFile(filePath, '# Interrupted\n\n第一段', 'utf8');
        await ingestController.scanVault();

        const database = databaseService.getDatabase();
        const file = database.prepare('SELECT id FROM files WHERE path = ?').get(filePath) as {
            id: number;
        };
        const embedCallsAfterFirstScan = (embeddingService.embedText as jest.Mock).mock.calls.length;
        const runningJobId = Number(
            database
                .prepare(
                    "INSERT INTO sync_jobs (file_id, job_type, status, updated_at) VALUES (?, 'index', 'running', CURRENT_TIMESTAMP)",
                )
                .run(file.id).lastInsertRowid,
        );

        const repairScan = await ingestController.scanVault();
        const interruptedJob = database
            .prepare('SELECT status, error_message FROM sync_jobs WHERE id = ?')
            .get(runningJobId) as {
                status: string;
                error_message: string | null;
            };
        const repairedFile = database
            .prepare('SELECT status, observed_hash, indexed_hash FROM files WHERE id = ?')
            .get(file.id) as {
                status: string;
                observed_hash: string;
                indexed_hash: string;
            };

        expect(interruptedJob).toEqual({
            status: 'failed',
            error_message: 'interrupted',
        });
        expect((embeddingService.embedText as jest.Mock).mock.calls.length).toBeGreaterThan(
            embedCallsAfterFirstScan,
        );
        expect(repairedFile.status).toBe('active');
        expect(repairedFile.indexed_hash).toBe(repairedFile.observed_hash);
        expect(repairScan.importedCount).toBe(1);
        expect(repairScan.skippedCount).toBe(0);
        expect(repairScan.breakdown).toEqual({
            newCount: 0,
            changedCount: 1,
            unchangedCount: 0,
            deletedCount: 0,
        });
        expect(repairScan.items).toEqual([
            expect.objectContaining({
                filePath,
                event: 'changed',
                action: 'indexed',
                success: true,
            }),
        ]);
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
        expect(result.reconciledCount).toBe(3);
        expect(result.importedCount).toBe(3);
        expect(result.skippedCount).toBe(0);
        expect(result.deletedCount).toBe(0);
        expect(result.failedCount).toBe(0);
        expect(result.breakdown).toEqual({
            newCount: 3,
            changedCount: 0,
            unchangedCount: 0,
            deletedCount: 0,
        });
        expect(result.items).toHaveLength(3);
        expect(result.items.map((item) => item.filePath)).toEqual([
            join(vaultPath, 'alpha.md'),
            join(vaultPath, 'beta.txt'),
            join(vaultPath, 'nested', 'gamma.md'),
        ]);
        expect(result.items.map((item) => item.event)).toEqual(['new', 'new', 'new']);
        expect(result.items.map((item) => item.action)).toEqual(['indexed', 'indexed', 'indexed']);
    });
});
