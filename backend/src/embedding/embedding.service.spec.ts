import { EmbeddingService } from './embedding.service';
import { ConfigService } from '../config/config.service';

describe('EmbeddingService', () => {
    it('should expose provider info from config', () => {
        process.env.EMBEDDING_PROVIDER = 'openai-compatible';
        process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
        process.env.EMBEDDING_BASE_URL = 'https://api.openai.com/v1';

        const configService = new ConfigService();
        const embeddingService = new EmbeddingService(configService);

        expect(embeddingService.getProviderInfo()).toEqual({
            provider: 'openai-compatible',
            model: 'text-embedding-3-small',
            baseUrl: 'https://api.openai.com/v1',
        });
    });
});
