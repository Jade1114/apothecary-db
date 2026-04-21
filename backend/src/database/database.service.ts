import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly databasePath =
    process.env.DATABASE_PATH ?? join(process.cwd(), '..', 'data', 'app.db');

  private readonly database = new DatabaseSync(this.databasePath);

  onModuleInit(): void {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  }

  getDatabase(): DatabaseSync {
    return this.database;
  }
}
