import { Inject, BadRequestException, Injectable } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';
import type { VectorPoint } from '../vector/types/vector.types';
import { IngestDto } from './dto/ingest.dto';
import type { IngestResponse } from './types/ingest.types';

@Injectable()
export class IngestService {
    constructor(
        private readonly documentsService: DocumentsService,
        private readonly embeddingService: EmbeddingService,
        @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    ) {}

    async ingest(request: IngestDto): Promise<IngestResponse> {
        const cleanedContent = request.content.trim();
        if (!cleanedContent) {
            throw new BadRequestException('content 不能为空');
        }

        const chunks = this.splitIntoChunks(cleanedContent);
        const sourceType = request.sourceType ?? 'text';
        const sourceName = request.sourceName ?? null;
        const created = this.documentsService.createDocument(cleanedContent, sourceType, sourceName);

        const vectors = await Promise.all(chunks.map((chunk) => this.embeddingService.embedText(chunk)));
        const chunkRecords = this.documentsService.createChunks(created.documentId, chunks);

        const points: VectorPoint[] = chunks.map((chunk, index) => ({
            id: String(chunkRecords[index].id),
            vector: vectors[index],
            payload: {
                chunkId: chunkRecords[index].id,
                documentId: created.documentId,
                sourceType,
                sourceName,
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
            sourceType,
            sourceName,
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
}
