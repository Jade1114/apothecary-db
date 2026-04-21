import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

@Module({
  imports: [DocumentsModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
