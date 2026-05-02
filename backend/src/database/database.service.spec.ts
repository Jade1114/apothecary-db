import { DatabaseSync } from 'node:sqlite';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '../config/config.service';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
    let databasePath: string;

    beforeEach(() => {
        databasePath = join(tmpdir(), `apothecary-legacy-${Date.now()}.db`);
    });

    afterEach(async () => {
        await rm(databasePath, { force: true });
    });

    it('should migrate legacy timestamp columns without non-constant defaults', () => {
        const legacyDatabase = new DatabaseSync(databasePath);
        legacyDatabase.exec(`
            CREATE TABLE files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                hash TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plain_text TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL
            );

            INSERT INTO documents (plain_text) VALUES ('legacy document');
        `);
        legacyDatabase.close();

        const databaseService = new DatabaseService(createConfigService());

        expect(() => databaseService.onModuleInit()).not.toThrow();

        const database = databaseService.getDatabase();
        const fileColumns = database.prepare('PRAGMA table_info(files)').all() as Array<{
            name: string;
        }>;
        const documentColumns = database
            .prepare('PRAGMA table_info(documents)')
            .all() as Array<{ name: string }>;

        expect(fileColumns.some((column) => column.name === 'last_seen_at')).toBe(true);
        expect(documentColumns.some((column) => column.name === 'file_id')).toBe(true);
        expect(documentColumns.some((column) => column.name === 'source_type')).toBe(true);
        expect(documentColumns.some((column) => column.name === 'source_name')).toBe(true);
        expect(documentColumns.some((column) => column.name === 'updated_at')).toBe(true);
        expect(() =>
            database
                .prepare(
                    `
                    SELECT documents.id, documents.file_id
                    FROM documents
                    LEFT JOIN files ON files.id = documents.file_id
                    WHERE documents.file_id IS NULL OR files.status != 'deleted'
                    `,
                )
                .all(),
        ).not.toThrow();
    });

    function createConfigService(): ConfigService {
        return {
            get databasePath(): string {
                return databasePath;
            },
        } as ConfigService;
    }
});
