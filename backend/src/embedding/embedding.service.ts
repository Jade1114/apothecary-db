import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '../config/config.service';
import type { EmbeddingProviderInfo, EmbeddingVector } from './types/embedding.types';

@Injectable()
export class EmbeddingService {
    constructor(private readonly configService: ConfigService) {}

    getProviderInfo(): EmbeddingProviderInfo {
        return {
            provider: this.configService.embeddingProvider,
            model: this.configService.embeddingModel,
            baseUrl: this.configService.embeddingBaseUrl,
        };
    }

    async embedText(text: string): Promise<EmbeddingVector> {
        const cleanedText = text.trim();
        if (!cleanedText) {
            throw new Error('embedText 不接受空文本');
        }

        const apiKey = this.configService.embeddingApiKey;
        if (!apiKey) {
            throw new Error('缺少 EMBEDDING_API_KEY 或 OPENAI_API_KEY');
        }

        const client = new OpenAI({
            apiKey,
            baseURL: this.configService.embeddingBaseUrl,
        });

        const response = await client.embeddings.create({
            model: this.configService.embeddingModel,
            input: cleanedText,
        });

        const embedding = response.data[0]?.embedding;
        if (!embedding) {
            throw new Error('embedding provider 没有返回向量结果');
        }

        return embedding;
    }
}
