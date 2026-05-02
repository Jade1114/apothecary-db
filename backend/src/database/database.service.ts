import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import sqliteVec from 'sqlite-vec';
import { ConfigService } from '../config/config.service';

@Injectable()
export class DatabaseService implements OnModuleInit {
    private readonly database: DatabaseSync;

    constructor(private readonly configService: ConfigService) {
        this.database = new DatabaseSync(this.configService.databasePath, {
            allowExtension: true,
        });
    }

    onModuleInit(): void {
        sqliteVec.load(this.database);
        this.database.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        hash TEXT,
        observed_hash TEXT,
        indexed_hash TEXT,
        observed_at DATETIME,
        indexed_at DATETIME,
        status TEXT NOT NULL DEFAULT 'active',
        last_normalized_path TEXT,
        normalized_retained_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        plain_text TEXT NOT NULL,
        source_type TEXT,
        source_name TEXT,
        title TEXT,
        source_path TEXT,
        normalized_path TEXT,
        parser_name TEXT,
        parser_version TEXT,
        parse_status TEXT NOT NULL DEFAULT 'ready',
        index_status TEXT NOT NULL DEFAULT 'failed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files (id)
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER,
        source_block_start INTEGER,
        source_block_end INTEGER,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id),
        UNIQUE(document_id, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS chunk_vectors (
        chunk_id INTEGER PRIMARY KEY,
        vector_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        dimension INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chunk_id) REFERENCES chunks (id)
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        summary TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents (id)
      );

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files (id)
      );
    `);

        this.ensureColumn('files', 'name', 'TEXT');
        this.ensureColumn('files', 'extension', 'TEXT');
        this.ensureColumn('files', 'size', 'INTEGER');
        this.ensureColumn('files', 'observed_hash', 'TEXT');
        this.ensureColumn('files', 'indexed_hash', 'TEXT');
        this.ensureColumn('files', 'observed_at', 'DATETIME');
        this.ensureColumn('files', 'indexed_at', 'DATETIME');
        this.ensureColumn('files', 'last_seen_at', 'DATETIME');
        this.ensureColumn('files', 'deleted_at', 'DATETIME');
        this.ensureColumn('files', 'last_normalized_path', 'TEXT');
        this.ensureColumn('files', 'normalized_retained_at', 'DATETIME');
        this.ensureColumn('documents', 'file_id', 'INTEGER');
        this.ensureColumn('documents', 'plain_text', 'TEXT');
        this.ensureColumn('documents', 'source_type', 'TEXT');
        this.ensureColumn('documents', 'source_name', 'TEXT');
        this.ensureColumn('documents', 'title', 'TEXT');
        this.ensureColumn('documents', 'source_path', 'TEXT');
        this.ensureColumn('documents', 'normalized_path', 'TEXT');
        this.ensureColumn('documents', 'parser_name', 'TEXT');
        this.ensureColumn('documents', 'parser_version', 'TEXT');
        this.ensureColumn('documents', 'parse_status', "TEXT DEFAULT 'ready'");
        this.ensureColumn('documents', 'index_status', "TEXT DEFAULT 'failed'");
        this.ensureColumn('documents', 'updated_at', 'DATETIME');
        this.ensureColumn('chunks', 'text', 'TEXT');
        this.ensureColumn('chunks', 'token_count', 'INTEGER');
        this.ensureColumn('chunks', 'source_block_start', 'INTEGER');
        this.ensureColumn('chunks', 'source_block_end', 'INTEGER');
        this.ensureColumn('chunks', 'metadata_json', 'TEXT');
        this.backfillTimestampColumns();
        this.backfillDocumentPlainText();
        this.backfillChunkText();
        this.dropColumnIfExists('documents', 'content');
        this.dropColumnIfExists('chunks', 'content');
        this.backfillFileHashVersions();
        this.normalizeLegacyDocumentStatuses();
    }

    getDatabase(): DatabaseSync {
        return this.database;
    }

    /**
     * 在事务中执行数据库操作。
     * * 该方法遵循 ACID 原则：
     * 1. 自动开启事务 (`BEGIN IMMEDIATE`) 以防止死锁。
     * 2. 同步执行传入的业务逻辑 `work`。
     * 3. 若成功则 `COMMIT`，若捕获到任何异常则自动 `ROLLBACK`。
     * * @template T 业务逻辑返回值的类型。
     * @param {() => T} work 需要在事务中执行的同步回调函数。
     * @returns {Promise<T>} 返回回调函数的执行结果。
     * @throws {Error} 重新抛出 `work` 执行期间产生的错误，或数据库指令失败的错误。
     * * @example
     * repository.withTransaction(() => {
     * repository.updateInventory(itemId, -1);
     * repository.createOrder(orderData);
     * });
     */
    withTransaction<T>(work: () => T): T {
        this.database.exec('BEGIN IMMEDIATE');

        try {
            const result = work();
            this.database.exec('COMMIT');
            return result;
        } catch (error) {
            this.database.exec('ROLLBACK');
            throw error;
        }
    }

    private ensureColumn(
        tableName: string,
        columnName: string,
        columnDefinition: string,
    ): void {
        if (this.columnExists(tableName, columnName)) {
            return;
        }

        this.database.exec(
            `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
        );
    }

    private columnExists(tableName: string, columnName: string): boolean {
        const columns = this.database
            .prepare(`PRAGMA table_info(${tableName})`)
            .all() as Array<{ name: string }>;
        return columns.some((column) => column.name === columnName);
    }

    private dropColumnIfExists(tableName: string, columnName: string): void {
        if (!this.columnExists(tableName, columnName)) {
            return;
        }

        this.database.exec(
            `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`,
        );
    }

    private backfillTimestampColumns(): void {
        this.database.exec(`
          UPDATE files
          SET last_seen_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
          WHERE last_seen_at IS NULL;

          UPDATE documents
          SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)
          WHERE updated_at IS NULL;
        `);
    }

    private normalizeLegacyDocumentStatuses(): void {
        this.database.exec(`
          UPDATE documents
          SET parse_status = CASE
            WHEN parse_status IS NULL THEN 'ready'
            WHEN parse_status = 'parsed' THEN 'ready'
            WHEN parse_status = 'pending' THEN 'failed'
            ELSE parse_status
          END;

          UPDATE documents
          SET index_status = CASE
            WHEN index_status = 'indexed' THEN 'ready'
            WHEN index_status = 'pending' THEN 'failed'
            WHEN index_status IS NULL AND EXISTS (
              SELECT 1 FROM chunks WHERE chunks.document_id = documents.id
            ) THEN 'ready'
            WHEN index_status IS NULL THEN 'failed'
            ELSE index_status
          END;
        `);
    }

    private backfillDocumentPlainText(): void {
        if (!this.columnExists('documents', 'content')) {
            return;
        }

        this.database.exec(`
          UPDATE documents
          SET plain_text = content
          WHERE (plain_text IS NULL OR plain_text = '')
            AND content IS NOT NULL;
        `);
    }

    private backfillChunkText(): void {
        if (!this.columnExists('chunks', 'content')) {
            return;
        }

        this.database.exec(`
          UPDATE chunks
          SET text = content
          WHERE (text IS NULL OR text = '')
            AND content IS NOT NULL;
        `);
    }

    private backfillFileHashVersions(): void {
        this.database.exec(`
          UPDATE files
          SET observed_hash = hash
          WHERE observed_hash IS NULL
            AND hash IS NOT NULL;

          UPDATE files
          SET indexed_hash = hash
          WHERE indexed_hash IS NULL
            AND hash IS NOT NULL;

          UPDATE files
          SET observed_at = COALESCE(last_seen_at, updated_at, created_at, CURRENT_TIMESTAMP)
          WHERE observed_at IS NULL;

          UPDATE files
          SET indexed_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
          WHERE indexed_at IS NULL
            AND indexed_hash IS NOT NULL;
        `);
    }
}
