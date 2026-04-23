import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { FilesModule } from '../files/files.module';
import { ParserModule } from '../parser/parser.module';
import { VectorModule } from '../vector/vector.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
    imports: [DocumentsModule, EmbeddingModule, VectorModule, ParserModule, FilesModule],
    controllers: [IngestController],
    providers: [IngestService],
})
export class IngestModule {}
