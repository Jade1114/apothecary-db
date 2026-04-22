import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { LlmModule } from './llm/llm.module';
import { ParserModule } from './parser/parser.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RagModule } from './rag/rag.module';
import { VectorModule } from './vector/vector.module';

@Module({
    imports: [
        ConfigModule,
        HealthModule,
        DatabaseModule,
        DocumentsModule,
        ProfilesModule,
        ParserModule,
        EmbeddingModule,
        VectorModule,
        LlmModule,
        IngestModule,
        RagModule,
    ],
})
export class AppModule {}
