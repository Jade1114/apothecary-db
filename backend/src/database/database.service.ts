import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { ConfigService } from '../config/config.service';

@Injectable()
export class DatabaseService implements OnModuleInit {
    private readonly database: DatabaseSync;

    constructor(private readonly configService: ConfigService) {
        this.database = new DatabaseSync(this.configService.databasePath);
    }

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
