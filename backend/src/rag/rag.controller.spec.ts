import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmModule } from '../llm/llm.module';
import { LlmService } from '../llm/llm.service';
import { RagController } from './rag.controller';
import { RagModule } from './rag.module';
import { RagService } from './rag.service';
import { VectorModule } from '../vector/vector.module';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';

describe('RagController', () => {
    let ragController: RagController;
    let embeddingService: EmbeddingService;
    let vectorStore: VectorStore;
    let llmService: LlmService;
    let searchSpy: jest.SpiedFunction<VectorStore['search']>;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';

        const app: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, DatabaseModule, EmbeddingModule, VectorModule, LlmModule, RagModule],
            controllers: [RagController],
            providers: [RagService],
        }).compile();

        app.get(DatabaseService).onModuleInit();
        ragController = app.get<RagController>(RagController);
        embeddingService = app.get(EmbeddingService);
        vectorStore = app.get<VectorStore>(VECTOR_STORE);
        llmService = app.get(LlmService);

        jest.spyOn(embeddingService, 'embedText').mockResolvedValue([0.1, 0.2, 0.3]);
        searchSpy = jest.spyOn(vectorStore, 'search').mockReturnValue([
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

        expect(searchSpy).toHaveBeenCalledWith({
            queryVector: [0.1, 0.2, 0.3],
            limit: 3,
            documentId: 22,
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
