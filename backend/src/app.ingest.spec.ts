import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { IngestModule } from './ingest/ingest.module';
import { IngestService } from './ingest/ingest.service';
import { ProfilesModule } from './profiles/profiles.module';
import { DatabaseService } from './database/database.service';

describe('AppController ingest', () => {
  let appController: AppController;

  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';

    const app: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule, DocumentsModule, IngestModule, ProfilesModule],
      controllers: [AppController],
      providers: [IngestService],
    }).compile();

    app.get(DatabaseService).onModuleInit();
    appController = app.get<AppController>(AppController);
  });

  it('should ingest content and return chunk count', () => {
    const result = appController.ingest({
      content: '第一段资料。\n\n第二段资料。',
      sourceType: 'text',
      sourceName: 'manual',
    });

    expect(result).toEqual({
      success: true,
      documentId: 1,
      chunkCount: 2,
      sourceType: 'text',
      sourceName: 'manual',
    });
  });
});
