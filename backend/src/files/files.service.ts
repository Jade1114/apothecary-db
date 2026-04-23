import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';
import type { FileRecord, FileStatus, RegisterFileResult } from './types/file.types';

@Injectable()
export class FilesService {
    constructor(
        private readonly configService: ConfigService,
        private readonly databaseService: DatabaseService,
    ) {}

    async registerFile(inputPath: string): Promise<RegisterFileResult> {
        const snapshot = await this.buildSnapshot(inputPath);
        const database = this.databaseService.getDatabase();
        const existing = database
            .prepare(
                'SELECT id, path, name, extension, kind, size, hash, status, created_at, updated_at, last_seen_at FROM files WHERE path = ?',
            )
            .get(snapshot.path) as FileRecord | undefined;

        if (!existing) {
            const result = database
                .prepare(
                    `INSERT INTO files (path, name, extension, kind, size, hash, status, last_seen_at)
                     VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
                )
                .run(
                    snapshot.path,
                    snapshot.name,
                    snapshot.extension,
                    snapshot.kind,
                    snapshot.size,
                    snapshot.hash,
                );

            return {
                file: this.getFileById(Number(result.lastInsertRowid)),
                shouldProcess: true,
                reason: 'new',
            };
        }

        const status: FileStatus = existing.hash === snapshot.hash ? 'active' : 'changed';
        database
            .prepare(
                `UPDATE files
                 SET name = ?, extension = ?, kind = ?, size = ?, hash = ?, status = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
            )
            .run(
                snapshot.name,
                snapshot.extension,
                snapshot.kind,
                snapshot.size,
                snapshot.hash,
                status,
                existing.id,
            );

        return {
            file: this.getFileById(existing.id),
            shouldProcess: status === 'changed',
            reason: status === 'changed' ? 'changed' : 'unchanged',
        };
    }

    markProcessed(fileId: number): void {
        this.updateStatus(fileId, 'active');
    }

    markError(fileId: number): void {
        this.updateStatus(fileId, 'error');
    }

    markMissingFilesDeleted(seenPaths: string[]): void {
        const database = this.databaseService.getDatabase();
        const records = database
            .prepare(
                'SELECT id, path FROM files WHERE path LIKE ? AND status != ?',
            )
            .all(`${this.configService.vaultPath}%`, 'deleted') as Array<{ id: number; path: string }>;
        const seenPathSet = new Set(seenPaths.map((filePath) => resolve(filePath)));

        for (const record of records) {
            if (!seenPathSet.has(resolve(record.path))) {
                this.updateStatus(record.id, 'deleted');
            }
        }
    }

    getFileById(fileId: number): FileRecord {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                'SELECT id, path, name, extension, kind, size, hash, status, created_at, updated_at, last_seen_at FROM files WHERE id = ?',
            )
            .get(fileId) as FileRecord;
    }

    private async buildSnapshot(inputPath: string): Promise<{
        path: string;
        name: string;
        extension: string;
        kind: string;
        size: number;
        hash: string;
    }> {
        const resolvedPath = this.resolveVaultPath(inputPath);
        await access(resolvedPath);

        const fileBuffer = await readFile(resolvedPath);
        const stats = await stat(resolvedPath);
        const extension = extname(resolvedPath).toLowerCase().replace('.', '');

        return {
            path: resolvedPath,
            name: basename(resolvedPath),
            extension,
            kind: this.resolveKind(extension),
            size: stats.size,
            hash: createHash('sha256').update(fileBuffer).digest('hex'),
        };
    }

    private resolveVaultPath(inputPath: string): string {
        const resolvedPath = isAbsolute(inputPath)
            ? resolve(inputPath)
            : resolve(this.configService.vaultPath, inputPath);
        const relativePath = relative(this.configService.vaultPath, resolvedPath);

        if (relativePath.startsWith('..') || relativePath === '') {
            if (resolvedPath !== resolve(this.configService.vaultPath)) {
                throw new BadRequestException('只允许处理 Apothecary Vault 目录中的文件');
            }
        }

        return resolvedPath;
    }

    private resolveKind(extension: string): string {
        switch (extension) {
            case 'md':
                return 'markdown';
            case 'txt':
                return 'text';
            case 'pdf':
                return 'pdf';
            case 'docx':
                return 'docx';
            default:
                return 'unknown';
        }
    }

    private updateStatus(fileId: number, status: FileStatus): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                'UPDATE files SET status = ?, updated_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?',
            )
            .run(status, fileId);
    }
}
