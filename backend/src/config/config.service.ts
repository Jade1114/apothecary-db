import { Injectable } from '@nestjs/common';
import { homedir } from 'node:os';
import { join } from 'node:path';

@Injectable()
export class ConfigService {
    get port(): number {
        return Number(process.env.PORT ?? 3000);
    }

    get appName(): string {
        return process.env.APP_NAME ?? 'Apothecary DB';
    }

    get databasePath(): string {
        return process.env.DATABASE_PATH ?? join(process.cwd(), '..', 'data', 'app.db');
    }

    get vaultPath(): string {
        const configuredPath = process.env.APOTHECARY_VAULT_PATH;
        if (!configuredPath) {
            return join(homedir(), 'Apothecary-Vault');
        }

        return configuredPath.startsWith('~/')
            ? join(homedir(), configuredPath.slice(2))
            : configuredPath;
    }

    get normalizedDocumentsPath(): string {
        return join(this.vaultPath, '.apothecary', 'normalized');
    }

    get watcherEnabled(): boolean {
        return (process.env.APOTHECARY_WATCHER_ENABLED ?? 'true').toLowerCase() !== 'false';
    }

    get watcherDebounceMs(): number {
        const configuredValue = Number(
            process.env.APOTHECARY_WATCHER_DEBOUNCE_MS ?? 750,
        );

        return Number.isFinite(configuredValue) && configuredValue >= 0
            ? configuredValue
            : 750;
    }

    get embeddingApiKey(): string | null {
        return process.env.EMBEDDING_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
    }

    get embeddingBaseUrl(): string {
        return process.env.EMBEDDING_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    }

    get embeddingModel(): string {
        return process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
    }

    get embeddingProvider(): string {
        return process.env.EMBEDDING_PROVIDER ?? 'openai-compatible';
    }

    get vectorDimension(): number {
        return Number(process.env.VECTOR_DIMENSION ?? 1536);
    }

    get llmApiKey(): string | null {
        return process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? null;
    }

    get llmBaseUrl(): string {
        return process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    }

    get llmModel(): string {
        return process.env.LLM_MODEL ?? 'gpt-4o-mini';
    }

    get llmProvider(): string {
        return process.env.LLM_PROVIDER ?? 'openai-compatible';
    }
}
