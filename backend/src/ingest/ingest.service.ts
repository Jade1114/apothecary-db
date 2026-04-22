import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Inject, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { DocumentsService } from '../documents/documents.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { NormalizedDocumentService } from '../parser/normalized-document.service';
import { ParserService } from '../parser/parser.service';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';
import type { VectorPoint } from '../vector/types/vector.types';
import { IngestDto } from './dto/ingest.dto';
import { IngestFileDto } from './dto/ingest-file.dto';
import type { FileIngestResponse } from './types/file-ingest.types';
import type { IngestResponse } from './types/ingest.types';
import type { VaultScanItem, VaultScanResponse } from './types/vault-scan.types';

@Injectable()
export class IngestService {
    constructor(
        private readonly configService: ConfigService,
        private readonly documentsService: DocumentsService,
        private readonly embeddingService: EmbeddingService,
        private readonly parserService: ParserService,
        private readonly normalizedDocumentService: NormalizedDocumentService,
        @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    ) {}

    async ingest(request: IngestDto): Promise<IngestResponse> {
        const cleanedContent = request.content.trim();
        if (!cleanedContent) {
            throw new BadRequestException('content 不能为空');
        }

        return this.ingestNormalizedText({
            content: cleanedContent,
            sourceType: request.sourceType ?? 'text',
            sourceName: request.sourceName ?? null,
            sourcePath: null,
            normalizedPath: null,
        });
    }

    async ingestFile(request: IngestFileDto): Promise<FileIngestResponse> {
        const normalizedDocument = await this.parserService.parseFile(request.filePath);
        const normalizedPath = await this.normalizedDocumentService.writeDocument(normalizedDocument);
        const result = await this.ingestNormalizedText({
            content: normalizedDocument.plainText,
            sourceType: normalizedDocument.sourceType,
            sourceName: normalizedDocument.sourceName,
            sourcePath: normalizedDocument.sourcePath,
            normalizedPath,
        });

        return {
            ...result,
            sourcePath: normalizedDocument.sourcePath,
            normalizedPath,
            title: normalizedDocument.title,
        };
    }

    async scanVault(): Promise<VaultScanResponse> {
        const files = await this.collectSupportedFiles(this.configService.vaultPath);
        const items: VaultScanItem[] = [];

        for (const filePath of files) {
            const relativePath = relative(this.configService.vaultPath, filePath);
            try {
                const result = await this.ingestFile({ filePath: relativePath });
                items.push({
                    filePath,
                    success: true,
                    result,
                });
            } catch (error) {
                items.push({
                    filePath,
                    success: false,
                    error: error instanceof Error ? error.message : '文件导入失败',
                });
            }
        }

        return {
            vaultPath: this.configService.vaultPath,
            scannedCount: files.length,
            importedCount: items.filter((item) => item.success).length,
            failedCount: items.filter((item) => !item.success).length,
            items,
        };
    }

    private async ingestNormalizedText(input: {
        content: string;
        sourceType: string;
        sourceName: string | null;
        sourcePath: string | null;
        normalizedPath: string | null;
    }): Promise<IngestResponse> {
        const chunks = this.splitIntoChunks(input.content);
        const created = this.documentsService.createDocument(
            input.content,
            input.sourceType,
            input.sourceName,
            input.sourcePath,
            input.normalizedPath,
        );

        const vectors = await Promise.all(chunks.map((chunk) => this.embeddingService.embedText(chunk)));
        const chunkRecords = this.documentsService.createChunks(created.documentId, chunks);

        const points: VectorPoint[] = chunks.map((chunk, index) => ({
            id: String(chunkRecords[index].id),
            vector: vectors[index],
            payload: {
                chunkId: chunkRecords[index].id,
                documentId: created.documentId,
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

        return {
            success: true,
            documentId: created.documentId,
            chunkCount: chunks.length,
            sourceType: input.sourceType,
            sourceName: input.sourceName,
            indexing: {
                embeddingReady: true,
                vectorReady: true,
                indexedPoints: points.length,
            },
        };
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
}
