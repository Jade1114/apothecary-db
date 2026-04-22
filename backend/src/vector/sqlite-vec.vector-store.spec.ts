import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { SqliteVecVectorStore } from './sqlite-vec.vector-store';

describe('SqliteVecVectorStore', () => {
    let vectorStore: SqliteVecVectorStore;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';
        process.env.VECTOR_DIMENSION = '1536';

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, DatabaseModule],
            providers: [SqliteVecVectorStore],
        }).compile();

        module.get(DatabaseService).onModuleInit();
        vectorStore = module.get(SqliteVecVectorStore);
    });

    it('should expose sqlite-vec provider info from config', () => {
        expect(vectorStore.getProviderInfo()).toEqual({
            url: ':memory:',
            collection: 'chunk_embeddings',
            vectorSize: 1536,
        });
    });
});
