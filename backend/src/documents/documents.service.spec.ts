import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
    let documentsService: DocumentsService;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, DatabaseModule],
            providers: [DocumentsService],
        }).compile();

        module.get(DatabaseService).onModuleInit();
        documentsService = module.get(DocumentsService);
    });

    it('should create and read a document by id', () => {
        const created = documentsService.createDocument('测试资料');
        const document = documentsService.getDocumentById(created.documentId);

        expect(document.id).toBe(created.documentId);
        expect(document.content).toBe('测试资料');
    });
});
