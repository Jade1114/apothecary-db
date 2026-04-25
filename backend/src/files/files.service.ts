import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';
import type {
    FileRecord,
    FileStatus,
    RegisterFileResult,
} from './types/file.types';

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
                `
                SELECT
                    id,
                    path,
                    name,
                    extension,
                    kind,
                    size,
                    hash,
                    observed_hash,
                    indexed_hash,
                    observed_at,
                    indexed_at,
                    status,
                    created_at,
                    updated_at,
                    last_seen_at,
                    deleted_at,
                    last_normalized_path,
                    normalized_retained_at
                FROM files
                WHERE path = ?
                `,
            )
            .get(snapshot.path) as FileRecord | undefined;

        if (!existing) {
            const result = database
                .prepare(
                    `
                    INSERT INTO files (
                        path,
                        name,
                        extension,
                        kind,
                        size,
                        observed_hash,
                        status,
                        observed_at,
                        last_seen_at,
                        deleted_at,
                        last_normalized_path,
                        normalized_retained_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'error', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, NULL)
                    `,
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

        const indexedHash = existing.indexed_hash ?? existing.hash;
        const shouldProcess =
            indexedHash !== snapshot.hash ||
            existing.status !== 'active' ||
            existing.deleted_at !== null;
        database
            .prepare(
                `UPDATE files
                 SET
                    name = ?,
                    extension = ?,
                    kind = ?,
                    size = ?,
                    observed_hash = ?,
                    status = ?,
                    observed_at = CURRENT_TIMESTAMP,
                    deleted_at = NULL,
                    normalized_retained_at = NULL,
                    updated_at = CURRENT_TIMESTAMP,
                    last_seen_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
            )
            .run(
                snapshot.name,
                snapshot.extension,
                snapshot.kind,
                snapshot.size,
                snapshot.hash,
                shouldProcess ? 'error' : existing.status,
                existing.id,
            );

        return {
            file: this.getFileById(existing.id),
            shouldProcess,
            reason: shouldProcess ? 'changed' : 'unchanged',
        };
    }

    markProcessed(fileId: number): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE files
                SET
                    hash = observed_hash,
                    indexed_hash = observed_hash,
                    indexed_at = CURRENT_TIMESTAMP,
                    status = 'active',
                    deleted_at = NULL,
                    normalized_retained_at = NULL,
                    updated_at = CURRENT_TIMESTAMP,
                    last_seen_at = COALESCE(observed_at, last_seen_at, CURRENT_TIMESTAMP)
                WHERE id = ?
                `,
            )
            .run(fileId);
    }

    markError(fileId: number): void {
        this.updateStatus(fileId, 'error');
    }

    markInterrupted(fileId: number): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE files
                SET status = 'error', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status != 'deleted'
                `,
            )
            .run(fileId);
    }

    recordNormalizedDocument(fileId: number, normalizedPath: string): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE files
                SET
                    last_normalized_path = ?,
                    normalized_retained_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
            )
            .run(normalizedPath, fileId);
    }

    markDeleted(fileId: number): void {
        const database = this.databaseService.getDatabase();
        database
            .prepare(
                `
                UPDATE files
                SET
                    status = 'deleted',
                    deleted_at = CURRENT_TIMESTAMP,
                    normalized_retained_at = CASE
                        WHEN last_normalized_path IS NULL THEN NULL
                        ELSE CURRENT_TIMESTAMP
                    END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
            )
            .run(fileId);
    }

    listFilesPendingDeleteReconcile(seenPaths: string[]): FileRecord[] {
        const database = this.databaseService.getDatabase();
        const records = database
            .prepare(
                `
                SELECT
                    id,
                    path,
                    name,
                    extension,
                    kind,
                    size,
                    hash,
                    observed_hash,
                    indexed_hash,
                    observed_at,
                    indexed_at,
                    status,
                    created_at,
                    updated_at,
                    last_seen_at,
                    deleted_at,
                    last_normalized_path,
                    normalized_retained_at
                FROM files
                WHERE path LIKE ? AND status != 'deleted'
                `,
            )
            .all(`${this.configService.vaultPath}%`) as FileRecord[];
        const seenPathSet = new Set(
            seenPaths.map((filePath) => resolve(filePath)),
        );

        return records.filter(
            (record) => !seenPathSet.has(resolve(record.path)),
        );
    }

    getFileById(fileId: number): FileRecord {
        const database = this.databaseService.getDatabase();
        return database
            .prepare(
                `
                SELECT
                    id,
                    path,
                    name,
                    extension,
                    kind,
                    size,
                    hash,
                    observed_hash,
                    indexed_hash,
                    observed_at,
                    indexed_at,
                    status,
                    created_at,
                    updated_at,
                    last_seen_at,
                    deleted_at,
                    last_normalized_path,
                    normalized_retained_at
                FROM files
                WHERE id = ?
                `,
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
        const relativePath = relative(
            this.configService.vaultPath,
            resolvedPath,
        );

        if (relativePath.startsWith('..') || relativePath === '') {
            if (resolvedPath !== resolve(this.configService.vaultPath)) {
                throw new BadRequestException(
                    '只允许处理 Apothecary Vault 目录中的文件',
                );
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
                `
                UPDATE files
                SET
                    status = ?,
                    deleted_at = NULL,
                    normalized_retained_at = NULL,
                    updated_at = CURRENT_TIMESTAMP,
                    last_seen_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
            )
            .run(status, fileId);
    }
}
