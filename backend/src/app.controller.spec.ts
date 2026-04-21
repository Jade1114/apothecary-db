import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocumentsModule } from './documents/documents.module';
import { IngestModule } from './ingest/ingest.module';
import { IngestService } from './ingest/ingest.service';
import { DatabaseModule } from './database/database.module';
import { ProfilesModule } from './profiles/profiles.module';
import { DatabaseService } from './database/database.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    process.env.DATABASE_PATH = ':memory:';

    const app: TestingModule = await Test.createTestingModule({
      imports: [DatabaseModule, DocumentsModule, IngestModule, ProfilesModule],
      controllers: [AppController],
      providers: [AppService, IngestService],
    }).compile();

    app.get(DatabaseService).onModuleInit();
    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return ok status', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });
  });
});
