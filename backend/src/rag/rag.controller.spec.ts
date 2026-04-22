import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmModule } from '../llm/llm.module';
import { LlmService } from '../llm/llm.service';
import { RagController } from './rag.controller';
import { RagModule } from './rag.module';
import { RagService } from './rag.service';
import { VectorModule } from '../vector/vector.module';
import { VectorService } from '../vector/vector.service';

describe('RagController', () => {
    let ragController: RagController;
    let embeddingService: EmbeddingService;
    let vectorService: VectorService;
    let llmService: LlmService;

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, EmbeddingModule, VectorModule, LlmModule, RagModule],
            controllers: [RagController],
            providers: [RagService],
        }).compile();

        ragController = app.get<RagController>(RagController);
        embeddingService = app.get(EmbeddingService);
        vectorService = app.get(VectorService);
        llmService = app.get(LlmService);

        jest.spyOn(embeddingService, 'embedText').mockResolvedValue([0.1, 0.2, 0.3]);
        jest.spyOn(vectorService, 'search').mockResolvedValue([
            {
                id: 'point-1',
                vector: [],
                payload: {
                    documentId: 22,
                    chunkIndex: 0,
                    content: '这是第一段 evidence',
                    sourceType: 'text',
                    sourceName: 'manual',
                },
            },
        ]);
        jest.spyOn(llmService, 'generateAnswer').mockResolvedValue('这是基于 evidence 的回答');
    });

    it('should return answer and evidence for rag query', async () => {
        const result = await ragController.query({
            query: 'NestJS 和 RAG',
            documentId: 22,
            limit: 3,
        });

        expect(result).toEqual({
            query: 'NestJS 和 RAG',
            answer: '这是基于 evidence 的回答',
            evidence: [
                {
                    id: 'point-1',
                    documentId: 22,
                    chunkIndex: 0,
                    content: '这是第一段 evidence',
                    sourceType: 'text',
                    sourceName: 'manual',
                },
            ],
            retrieval: {
                limit: 3,
                matchedCount: 1,
            },
            generation: {
                answered: true,
            },
        });
    });
});
