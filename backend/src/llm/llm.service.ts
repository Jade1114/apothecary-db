import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '../config/config.service';
import { buildRagAnswerPrompt } from './prompts';
import type { GenerateAnswerInput, LlmProviderInfo } from './types/llm.types';

@Injectable()
export class LlmService {
    constructor(private readonly configService: ConfigService) {}

    getProviderInfo(): LlmProviderInfo {
        return {
            provider: this.configService.llmProvider,
            model: this.configService.llmModel,
            baseUrl: this.configService.llmBaseUrl,
        };
    }

    async generateAnswer(input: GenerateAnswerInput): Promise<string> {
        const apiKey = this.configService.llmApiKey;
        if (!apiKey) {
            throw new Error('缺少 LLM_API_KEY 或 OPENAI_API_KEY');
        }

        const client = new OpenAI({
            apiKey,
            baseURL: this.configService.llmBaseUrl,
        });

        const completion = await client.chat.completions.create({
            model: this.configService.llmModel,
            messages: [
                {
                    role: 'system',
                    content: '你是一个严格基于 evidence 回答问题的助手，不要编造超出 evidence 的内容。',
                },
                {
                    role: 'user',
                    content: buildRagAnswerPrompt(input),
                },
            ],
            temperature: 0.2,
        });

        const content = completion.choices[0]?.message?.content?.trim();
        if (!content) {
            throw new Error('llm provider 没有返回有效回答');
        }

        return content;
    }
}
