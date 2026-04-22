import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { DocumentsModule } from '../documents/documents.module';
import { EmbeddingService } from '../embedding/embedding.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { IngestController } from './ingest.controller';
import { IngestModule } from './ingest.module';
import { IngestService } from './ingest.service';
import { ProfilesModule } from '../profiles/profiles.module';
import { VectorModule } from '../vector/vector.module';
import { VECTOR_STORE } from '../vector/vector-store';
import type { VectorStore } from '../vector/vector-store';

describe('IngestController', () => {
    let ingestController: IngestController;
    let embeddingService: EmbeddingService;
    let vectorStore: VectorStore;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';

        const app: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule,
                DatabaseModule,
                DocumentsModule,
                ProfilesModule,
                EmbeddingModule,
                VectorModule,
                IngestModule,
            ],
            controllers: [IngestController],
            providers: [IngestService],
        }).compile();

        app.get(DatabaseService).onModuleInit();
        ingestController = app.get<IngestController>(IngestController);
        embeddingService = app.get(EmbeddingService);
        vectorStore = app.get<VectorStore>(VECTOR_STORE);

        jest.spyOn(embeddingService, 'embedText').mockResolvedValue([0.1, 0.2, 0.3]);
        jest.spyOn(vectorStore, 'upsertPoints').mockResolvedValue();
    });

    it('should ingest content and return chunk count', async () => {
        const result = await ingestController.ingest({
            content: '第一段资料。\n\n第二段资料。',
            sourceType: 'text',
            sourceName: 'manual',
        });

        expect(result).toEqual({
            success: true,
            documentId: 1,
            chunkCount: 2,
            sourceType: 'text',
            sourceName: 'manual',
            indexing: {
                embeddingReady: true,
                vectorReady: true,
                indexedPoints: 2,
            },
        });
    });
});
