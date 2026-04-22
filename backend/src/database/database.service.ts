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
        status TEXT NOT NULL DEFAULT 'active',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER,
        content TEXT NOT NULL,
        source_type TEXT,
        source_name TEXT,
        source_path TEXT,
        normalized_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (file_id) REFERENCES files (id)
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
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
    `);

        this.ensureColumn('documents', 'source_path', 'TEXT');
        this.ensureColumn('documents', 'normalized_path', 'TEXT');
    }

    getDatabase(): DatabaseSync {
        return this.database;
    }

    private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
        const columns = this.database
            .prepare(`PRAGMA table_info(${tableName})`)
            .all() as Array<{ name: string }>;
        const exists = columns.some((column) => column.name === columnName);
        if (!exists) {
            this.database.exec(
                `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`,
            );
        }
    }
}
