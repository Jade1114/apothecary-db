import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { SqliteVecVectorStore } from './sqlite-vec.vector-store';

describe('SqliteVecVectorStore', () => {
    let vectorStore: SqliteVecVectorStore;
    let databaseService: DatabaseService;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';
        process.env.VECTOR_DIMENSION = '3';

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, DatabaseModule],
            providers: [SqliteVecVectorStore],
        }).compile();

        databaseService = module.get(DatabaseService);
        databaseService.onModuleInit();
        vectorStore = module.get(SqliteVecVectorStore);
    });

    it('should expose sqlite-vec provider info from config', () => {
        expect(vectorStore.getProviderInfo()).toEqual({
            url: ':memory:',
            collection: 'chunk_embeddings',
            vectorSize: 3,
        });
    });

    it('should filter search results by document id before applying the limit', () => {
        const database = databaseService.getDatabase();
        database
            .prepare(
                `
                INSERT INTO documents (
                    plain_text,
                    source_type,
                    source_name,
                    parse_status,
                    index_status,
                    updated_at
                ) VALUES (?, ?, ?, 'ready', 'ready', CURRENT_TIMESTAMP)
                `,
            )
            .run('doc-1', 'text', 'manual');
        database
            .prepare(
                `
                INSERT INTO documents (
                    plain_text,
                    source_type,
                    source_name,
                    parse_status,
                    index_status,
                    updated_at
                ) VALUES (?, ?, ?, 'ready', 'ready', CURRENT_TIMESTAMP)
                `,
            )
            .run('doc-2', 'text', 'manual');
        database
            .prepare(
                `
                INSERT INTO chunks (document_id, chunk_index, text, token_count)
                VALUES (1, 0, ?, 1), (2, 0, ?, 1)
                `,
            )
            .run('alpha', 'beta');

        vectorStore.upsertPoints([
            {
                id: '1',
                vector: [1, 0, 0],
                payload: {
                    chunkId: 1,
                },
            },
            {
                id: '2',
                vector: [0.9, 0, 0],
                payload: {
                    chunkId: 2,
                },
            },
        ]);

        const globalResults = vectorStore.search({
            queryVector: [1, 0, 0],
            limit: 1,
        });
        const scopedResults = vectorStore.search({
            queryVector: [1, 0, 0],
            limit: 1,
            documentId: 2,
        });

        expect(globalResults).toHaveLength(1);
        expect(globalResults[0].payload.documentId).toBe(1);
        expect(scopedResults).toHaveLength(1);
        expect(scopedResults[0].payload.documentId).toBe(2);
    });

    it('should exclude deleted files from search results', () => {
        const database = databaseService.getDatabase();
        database
            .prepare(
                `
                INSERT INTO files (path, name, extension, kind, size, hash, status, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, 'deleted', CURRENT_TIMESTAMP)
                `,
            )
            .run('/tmp/deleted.md', 'deleted.md', 'md', 'markdown', 8, 'hash-1');
        database
            .prepare(
                `
                INSERT INTO documents (
                    file_id,
                    plain_text,
                    source_type,
                    source_name,
                    parse_status,
                    index_status,
                    updated_at
                ) VALUES (?, ?, ?, ?, 'ready', 'ready', CURRENT_TIMESTAMP)
                `,
            )
            .run(1, 'deleted doc', 'md', 'deleted.md');
        database
            .prepare(
                `
                INSERT INTO chunks (document_id, chunk_index, text, token_count)
                VALUES (1, 0, ?, 1)
                `,
            )
            .run('gone');

        vectorStore.upsertPoints([
            {
                id: '1',
                vector: [1, 0, 0],
                payload: {
                    chunkId: 1,
                },
            },
        ]);

        expect(
            vectorStore.search({
                queryVector: [1, 0, 0],
                limit: 5,
            }),
        ).toEqual([]);
    });
});
