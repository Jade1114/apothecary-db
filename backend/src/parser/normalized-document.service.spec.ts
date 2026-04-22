import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { NormalizedDocumentService } from './normalized-document.service';

describe('NormalizedDocumentService', () => {
    let service: NormalizedDocumentService;
    let vaultPath: string;

    beforeEach(async () => {
        vaultPath = join(tmpdir(), `apothecary-vault-${Date.now()}`);
        process.env.APOTHECARY_VAULT_PATH = vaultPath;
        await mkdir(vaultPath, { recursive: true });

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule],
            providers: [NormalizedDocumentService],
        }).compile();

        service = module.get(NormalizedDocumentService);
    });

    it('should write normalized document as yaml plus markdown file', async () => {
        const filePath = await service.writeDocument({
            fileId: 'abc123',
            sourcePath: join(vaultPath, 'notes.txt'),
            sourceType: 'txt',
            sourceName: 'notes.txt',
            title: '测试标题',
            plainText: '第一段\n\n第二段',
            markdownBody: '# 测试标题\n\n第一段\n\n第二段',
            metadata: {
                extension: 'txt',
                hash: 'abc123',
                size: 12,
                parser: 'text-file-parser',
                parserVersion: 'v1',
                generatedAt: new Date().toISOString(),
            },
        });

        const content = await readFile(filePath, 'utf8');
        expect(content).toContain('source_type: txt');
        expect(content).toContain('# 测试标题');
    });
});
