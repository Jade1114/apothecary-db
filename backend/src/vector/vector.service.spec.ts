import { ConfigService } from '../config/config.service';
import { VectorService } from './vector.service';

describe('VectorService', () => {
    it('should expose qdrant provider info from config', () => {
        process.env.QDRANT_URL = 'http://localhost:6333';
        process.env.QDRANT_COLLECTION = 'profile_chunks';
        process.env.QDRANT_VECTOR_SIZE = '1536';

        const configService = new ConfigService();
        const vectorService = new VectorService(configService);

        expect(vectorService.getProviderInfo()).toEqual({
            url: 'http://localhost:6333',
            collection: 'profile_chunks',
            vectorSize: 1536,
        });
    });
});
