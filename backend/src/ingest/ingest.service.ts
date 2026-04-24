import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Inject, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import type { DocumentRecord } from '../documents/types/document.types';
import { EmbeddingService } from '../embedding/embedding.service';
import { FilesService } from '../files/files.service';
import type { FileRecord, RegisterFileResult } from '../files/types/file.types';
import { NormalizedDocumentService } from '../parser/normalized-document.service';
import { ParserService } from '../parser/parser.service';
import { SyncJobsService } from '../sync/sync-jobs.service';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';
import type { VectorPoint } from '../vector/types/vector.types';
import { IngestDto } from './dto/ingest.dto';
import { IngestFileDto } from './dto/ingest-file.dto';
import type { FileIngestResponse } from './types/file-ingest.types';
import type { IngestResponse } from './types/ingest.types';
import type {
    VaultScanBreakdown,
    VaultScanItem,
    VaultScanItemAction,
    VaultScanResponse,
} from './types/vault-scan.types';

@Injectable()
export class IngestService {
    constructor(
        private readonly configService: ConfigService,
        private readonly databaseService: DatabaseService,
        private readonly documentsService: DocumentsService,
        private readonly embeddingService: EmbeddingService,
        private readonly filesService: FilesService,
        private readonly parserService: ParserService,
        private readonly normalizedDocumentService: NormalizedDocumentService,
        private readonly syncJobsService: SyncJobsService,
        @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    ) {}

    async ingest(request: IngestDto): Promise<IngestResponse> {
        const cleanedContent = request.content.trim();
        if (!cleanedContent) {
            throw new BadRequestException('content 不能为空');
        }

        return this.persistIndexedDocument({
            content: cleanedContent,
            sourceType: request.sourceType ?? 'text',
            sourceName: request.sourceName ?? null,
            title: null,
            sourcePath: null,
            normalizedPath: null,
            parserName: null,
            parserVersion: null,
            fileId: null,
            existingDocuments: [],
        });
    }

    async ingestFile(request: IngestFileDto): Promise<FileIngestResponse> {
        const registration = await this.filesService.registerFile(request.filePath);
        const { result } = await this.reconcilePresentFile(request, registration);
        return result;
    }

    async scanVault(): Promise<VaultScanResponse> {
        return this.syncJobsService.runJob('scan', null, async () => {
            const files = await this.collectSupportedFiles(this.configService.vaultPath);
            const items: VaultScanItem[] = [];

            for (const filePath of files) {
                const relativePath = relative(this.configService.vaultPath, filePath);
                const registration = await this.filesService.registerFile(relativePath);
                try {
                    const { action, result } = await this.reconcilePresentFile(
                        { filePath: relativePath },
                        registration,
                    );
                    items.push({
                        fileId: registration.file.id,
                        filePath,
                        event: registration.reason,
                        action,
                        success: true,
                        result,
                    });
                } catch (error) {
                    items.push({
                        fileId: registration.file.id,
                        filePath,
                        event: registration.reason,
                        action: 'indexed',
                        success: false,
                        error: error instanceof Error ? error.message : '文件导入失败',
                    });
                }
            }

            const missingFiles = this.filesService.listFilesPendingDeleteReconcile(files);
            for (const file of missingFiles) {
                try {
                    await this.syncJobsService.runJob('delete', file.id, async () =>
                        this.reconcileDeletedFile(file),
                    );
                    items.push({
                        fileId: file.id,
                        filePath: file.path,
                        event: 'deleted',
                        action: 'deleted',
                        success: true,
                    });
                } catch {
                    // 单个删除回收失败不阻塞本次全量扫描，失败细节由 sync_jobs 记录。
                    items.push({
                        fileId: file.id,
                        filePath: file.path,
                        event: 'deleted',
                        action: 'deleted',
                        success: false,
                        error: '文件删除回收失败',
                    });
                }
            }

            const breakdown = this.buildScanBreakdown(items);
            const importedCount = items.filter(
                (item) => item.success && item.action === 'indexed',
            ).length;
            const skippedCount = items.filter(
                (item) => item.success && item.action === 'skipped',
            ).length;
            const deletedCount = items.filter(
                (item) => item.success && item.action === 'deleted',
            ).length;

            return {
                vaultPath: this.configService.vaultPath,
                scannedCount: files.length,
                reconciledCount: items.length,
                importedCount,
                skippedCount,
                deletedCount,
                failedCount: items.filter((item) => !item.success).length,
                breakdown,
                items,
            };
        });
    }

    private async reconcilePresentFile(
        request: IngestFileDto,
        registration: RegisterFileResult,
    ): Promise<{
        action: Extract<VaultScanItemAction, 'indexed' | 'skipped'>;
        result: FileIngestResponse;
    }> {
        const existingDocuments = this.documentsService.listDocumentsByFileId(registration.file.id);
        const existingDocument = existingDocuments[0] ?? null;

        if (registration.shouldProcess) {
            this.markExistingDocumentsStale(existingDocuments);
        }

        if (
            !registration.shouldProcess &&
            existingDocument &&
            (await this.isDocumentHealthy(registration.file, existingDocument, existingDocuments.length))
        ) {
            const chunkCount = this.documentsService.countChunks(existingDocument.id);
            return {
                action: 'skipped',
                result: {
                    success: true,
                    documentId: existingDocument.id,
                    chunkCount,
                    sourceType:
                        existingDocument.source_type ??
                        registration.file.extension ??
                        registration.file.kind,
                    sourceName: existingDocument.source_name ?? registration.file.name,
                    sourcePath: registration.file.path,
                    normalizedPath: existingDocument.normalized_path ?? '',
                    title: existingDocument.title ?? null,
                    indexing: {
                        embeddingReady: true,
                        vectorReady: true,
                        indexedPoints: chunkCount,
                    },
                },
            };
        }

        try {
            const { normalizedDocument, normalizedPath } = await this.syncJobsService.runJob(
                'parse',
                registration.file.id,
                async () => {
                    const parsedDocument = await this.parserService.parseFile(request.filePath);
                    const persistedNormalizedPath =
                        await this.normalizedDocumentService.writeDocument(parsedDocument);
                    this.filesService.recordNormalizedDocument(
                        registration.file.id,
                        persistedNormalizedPath,
                    );
                    return {
                        normalizedDocument: parsedDocument,
                        normalizedPath: persistedNormalizedPath,
                    };
                },
            );
            const result = await this.syncJobsService.runJob(
                'index',
                registration.file.id,
                async () =>
                    this.persistIndexedDocument({
                        content: normalizedDocument.plainText,
                        sourceType: normalizedDocument.sourceType,
                        sourceName: normalizedDocument.sourceName,
                        title: normalizedDocument.title,
                        sourcePath: normalizedDocument.sourcePath,
                        normalizedPath,
                        parserName: normalizedDocument.metadata.parser,
                        parserVersion: normalizedDocument.metadata.parserVersion,
                        fileId: registration.file.id,
                        existingDocuments,
                    }),
            );

            this.filesService.markProcessed(registration.file.id);

            return {
                action: 'indexed',
                result: {
                    ...result,
                    sourcePath: normalizedDocument.sourcePath,
                    normalizedPath,
                    title: normalizedDocument.title,
                },
            };
        } catch (error) {
            this.filesService.markError(registration.file.id);
            throw error;
        }
    }

    private async persistIndexedDocument(input: {
        content: string;
        sourceType: string;
        sourceName: string | null;
        title: string | null;
        sourcePath: string | null;
        normalizedPath: string | null;
        parserName: string | null;
        parserVersion: string | null;
        fileId: number | null;
        existingDocuments: DocumentRecord[];
    }): Promise<IngestResponse> {
        const chunks = this.splitIntoChunks(input.content);
        const vectors = await Promise.all(chunks.map((chunk) => this.embeddingService.embedText(chunk)));
        return this.databaseService.withTransaction(async () => {
            const existingDocument = input.existingDocuments[0] ?? null;
            const duplicateDocuments = input.existingDocuments.slice(1);

            for (const duplicateDocument of duplicateDocuments) {
                await this.vectorStore.deleteByDocumentId(duplicateDocument.id);
                this.documentsService.deleteDocumentCascade(duplicateDocument.id);
            }

            const documentId = existingDocument
                ? existingDocument.id
                : this.documentsService.createDocument(
                      input.content,
                      input.sourceType,
                      input.sourceName,
                      input.sourcePath,
                      input.normalizedPath,
                      input.fileId,
                      {
                          title: input.title,
                          parserName: input.parserName,
                          parserVersion: input.parserVersion,
                          parseStatus: 'ready',
                          indexStatus: 'stale',
                      },
                  ).documentId;

            if (existingDocument) {
                this.documentsService.updateDocument(documentId, {
                    plainText: input.content,
                    sourceType: input.sourceType,
                    sourceName: input.sourceName,
                    title: input.title,
                    sourcePath: input.sourcePath,
                    normalizedPath: input.normalizedPath,
                    parserName: input.parserName,
                    parserVersion: input.parserVersion,
                    parseStatus: 'ready',
                    indexStatus: 'stale',
                });
                await this.vectorStore.deleteByDocumentId(documentId);
                this.documentsService.deleteDocumentArtifacts(documentId);
            }

            const chunkRecords = this.documentsService.createChunks(documentId, chunks);
            const points: VectorPoint[] = chunks.map((chunk, index) => ({
                id: String(chunkRecords[index].id),
                vector: vectors[index],
                payload: {
                    chunkId: chunkRecords[index].id,
                    documentId,
                    sourceType: input.sourceType,
                    sourceName: input.sourceName,
                    chunkIndex: index,
                    content: chunk,
                },
            }));

            await this.vectorStore.upsertPoints(points);
            this.documentsService.createChunkVectorRecords(
                points.map((point, index) => ({
                    chunkId: chunkRecords[index].id,
                    vectorId: point.id,
                    provider: 'sqlite-vec',
                    dimension: point.vector.length,
                })),
            );
            this.documentsService.setDocumentStatuses(documentId, 'ready', 'ready');

            return {
                success: true,
                documentId,
                chunkCount: chunks.length,
                sourceType: input.sourceType,
                sourceName: input.sourceName,
                indexing: {
                    embeddingReady: true,
                    vectorReady: true,
                    indexedPoints: points.length,
                },
            };
        });
    }

    private splitIntoChunks(content: string): string[] {
        return content
            .split('\n\n')
            .map((chunk) => chunk.trim())
            .filter(Boolean);
    }

    private async collectSupportedFiles(directoryPath: string): Promise<string[]> {
        const entries = await readdir(directoryPath, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            if (entry.name === '.apothecary') {
                continue;
            }

            const fullPath = join(directoryPath, entry.name);
            if (entry.isDirectory()) {
                files.push(...(await this.collectSupportedFiles(fullPath)));
                continue;
            }

            if (this.isSupportedFile(entry.name)) {
                files.push(fullPath);
            }
        }

        return files.sort();
    }

    private isSupportedFile(fileName: string): boolean {
        return ['.txt', '.md', '.pdf', '.docx'].some((extension) =>
            fileName.toLowerCase().endsWith(extension),
        );
    }

    private async isDocumentHealthy(
        file: FileRecord,
        document: DocumentRecord,
        documentCount: number,
    ): Promise<boolean> {
        if (file.status !== 'active') {
            return false;
        }

        if (documentCount !== 1) {
            return false;
        }

        if (document.parse_status !== 'ready' || document.index_status !== 'ready') {
            return false;
        }

        const chunkCount = this.documentsService.countChunks(document.id);
        if (chunkCount === 0) {
            return false;
        }

        const vectorRecordCount = this.documentsService.countChunkVectorRecords(document.id);
        if (vectorRecordCount !== chunkCount) {
            return false;
        }

        const vectorPointCount = await this.vectorStore.countPointsByDocumentId(document.id);
        return vectorPointCount === chunkCount;
    }

    private async reconcileDeletedFile(file: FileRecord): Promise<void> {
        const documents = this.documentsService.listDocumentsByFileId(file.id);

        await this.databaseService.withTransaction(async () => {
            for (const document of documents) {
                await this.vectorStore.deleteByDocumentId(document.id);
                this.documentsService.deleteDocumentCascade(document.id);
            }

            this.filesService.markDeleted(file.id);
        });
    }

    private markExistingDocumentsStale(documents: DocumentRecord[]): void {
        for (const document of documents) {
            this.documentsService.setDocumentStatuses(document.id, 'stale', 'stale');
        }
    }

    private buildScanBreakdown(items: VaultScanItem[]): VaultScanBreakdown {
        return {
            newCount: items.filter((item) => item.event === 'new').length,
            changedCount: items.filter((item) => item.event === 'changed').length,
            unchangedCount: items.filter((item) => item.event === 'unchanged').length,
            deletedCount: items.filter((item) => item.event === 'deleted').length,
        };
    }
}
