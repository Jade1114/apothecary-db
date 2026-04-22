import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { LlmModule } from '../llm/llm.module';
import { VectorModule } from '../vector/vector.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
    imports: [EmbeddingModule, VectorModule, LlmModule],
    controllers: [RagController],
    providers: [RagService],
})
export class RagModule {}
