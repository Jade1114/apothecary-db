import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { IngestModule } from './ingest/ingest.module';
import { IngestService } from './ingest/ingest.service';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [DatabaseModule, DocumentsModule, IngestModule, ProfilesModule],
  controllers: [AppController],
  providers: [AppService, IngestService],
})
export class AppModule {}
