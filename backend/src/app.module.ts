import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { IngestService } from './ingest/ingest.service';
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [ConfigModule, HealthModule, DatabaseModule, DocumentsModule, IngestModule, ProfilesModule],
  controllers: [AppController],
  providers: [IngestService],
})
export class AppModule {}
