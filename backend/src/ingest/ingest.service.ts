import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { VectorService } from '../vector/vector.service';
import type { VectorPoint } from '../vector/types/vector.types';
import { IngestDto } from './dto/ingest.dto';
import type { IngestResponse } from './types/ingest.types';

@Injectable()
export class IngestService {
    constructor(
        private readonly documentsService: DocumentsService,
        private readonly embeddingService: EmbeddingService,
        private readonly vectorService: VectorService,
    ) {}

    async ingest(request: IngestDto): Promise<IngestResponse> {
        const cleanedContent = request.content.trim();
        if (!cleanedContent) {
            throw new BadRequestException('content 不能为空');
        }

        const chunks = this.splitIntoChunks(cleanedContent);
        const created = this.documentsService.createDocument(cleanedContent);
        const sourceType = request.sourceType ?? 'text';
        const sourceName = request.sourceName ?? null;

        const vectors = await Promise.all(
            chunks.map((chunk) => this.embeddingService.embedText(chunk)),
        );

        const points: VectorPoint[] = chunks.map((chunk, index) => ({
            id: randomUUID(),
            vector: vectors[index],
            payload: {
                documentId: created.documentId,
                sourceType,
                sourceName,
                chunkIndex: index,
                content: chunk,
            },
        }));

        await this.vectorService.upsertPoints(points);

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
