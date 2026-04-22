import { Injectable } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ConfigService } from '../config/config.service';
import type { SearchVectorInput, VectorPoint, VectorProviderInfo } from './types/vector.types';

@Injectable()
export class VectorService {
    constructor(private readonly configService: ConfigService) {}

    getProviderInfo(): VectorProviderInfo {
        return {
            url: this.configService.qdrantUrl,
            collection: this.configService.qdrantCollection,
            vectorSize: this.configService.qdrantVectorSize,
        };
    }

    async ensureCollection(): Promise<void> {
        const client = this.createClient();
        const collection = this.configService.qdrantCollection;

        const collections = await client.getCollections();
        const exists = collections.collections.some((item) => item.name === collection);
        if (exists) {
            return;
        }

        await client.createCollection(collection, {
            vectors: {
                size: this.configService.qdrantVectorSize,
                distance: 'Cosine',
            },
        });
    }

    async upsertPoints(points: VectorPoint[]): Promise<void> {
        if (points.length === 0) {
            return;
        }

        const client = this.createClient();
        await this.ensureCollection();
        await client.upsert(this.configService.qdrantCollection, {
            wait: true,
            points,
        });
    }

    async search(input: SearchVectorInput): Promise<VectorPoint[]> {
        if (input.queryVector.length === 0) {
            throw new Error('search 不接受空 queryVector');
        }

        const client = this.createClient();
        await this.ensureCollection();

        const result = await client.search(this.configService.qdrantCollection, {
            vector: input.queryVector,
            limit: input.limit ?? 5,
            filter: input.filter,
            with_payload: true,
        });

        return result.map((item) => ({
            id: String(item.id),
            vector: [],
            payload: (item.payload ?? {}) as Record<string, unknown>,
        }));
    }

    private createClient(): QdrantClient {
        return new QdrantClient({
            url: this.configService.qdrantUrl,
        });
    }
}
