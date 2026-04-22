import { ConfigService } from '../config/config.service';
import { LlmService } from './llm.service';

describe('LlmService', () => {
    it('should expose llm provider info from config', () => {
        process.env.LLM_PROVIDER = 'openai-compatible';
        process.env.LLM_MODEL = 'gpt-4o-mini';
        process.env.LLM_BASE_URL = 'https://api.openai.com/v1';

        const configService = new ConfigService();
        const llmService = new LlmService(configService);

        expect(llmService.getProviderInfo()).toEqual({
            provider: 'openai-compatible',
            model: 'gpt-4o-mini',
            baseUrl: 'https://api.openai.com/v1',
        });
    });
});
