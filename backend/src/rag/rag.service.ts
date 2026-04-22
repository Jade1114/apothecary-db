import { Inject, BadRequestException, Injectable } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmService } from '../llm/llm.service';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';
import { QueryRagDto } from './dto/query-rag.dto';
import type { RagEvidenceItem, RagQueryResponse } from './types/rag.types';

@Injectable()
export class RagService {
    constructor(
        private readonly embeddingService: EmbeddingService,
        @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
        private readonly llmService: LlmService,
    ) {}

    async query(input: QueryRagDto): Promise<RagQueryResponse> {
        const cleanedQuery = input.query.trim();
        if (!cleanedQuery) {
            throw new BadRequestException('query 不能为空');
        }

        const limit = input.limit ?? 5;
        const queryVector = await this.embeddingService.embedText(cleanedQuery);
        const points = await this.vectorStore.search({
            queryVector,
            limit,
        });

        const evidence: RagEvidenceItem[] = points.map((point) => ({
            id: point.id,
            documentId: this.getNumberValue(point.payload.documentId),
            chunkIndex: this.getNumberValue(point.payload.chunkIndex),
            content: String(point.payload.content ?? ''),
            sourceType: this.getStringValue(point.payload.sourceType),
            sourceName: this.getStringValue(point.payload.sourceName),
        }));

        const filteredEvidence = input.documentId
            ? evidence.filter((item) => item.documentId === input.documentId)
            : evidence;

        const answer = await this.llmService.generateAnswer({
            query: cleanedQuery,
            evidence: filteredEvidence.map((item) => item.content),
        });

        return {
            query: cleanedQuery,
            answer,
            evidence: filteredEvidence,
            retrieval: {
                limit,
                matchedCount: filteredEvidence.length,
            },
            generation: {
                answered: true,
            },
        };
    }

    private getNumberValue(value: unknown): number | null {
        return typeof value === 'number' ? value : null;
    }

    private getStringValue(value: unknown): string | null {
        return typeof value === 'string' ? value : null;
    }
}
