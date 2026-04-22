import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { ParserService } from './parser.service';

describe('ParserService', () => {
    let parserService: ParserService;
    let vaultPath: string;

    beforeEach(async () => {
        vaultPath = join(tmpdir(), `apothecary-vault-${Date.now()}`);
        process.env.APOTHECARY_VAULT_PATH = vaultPath;
        await mkdir(vaultPath, { recursive: true });

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule],
            providers: [ParserService],
        }).compile();

        parserService = module.get(ParserService);
    });

    it('should parse markdown file into normalized document', async () => {
        const filePath = join(vaultPath, 'notes.md');
        await writeFile(filePath, '# 标题\n\n这里是 markdown 内容。', 'utf8');

        const document = await parserService.parseFile('notes.md');

        expect(document.sourceType).toBe('md');
        expect(document.sourceName).toBe('notes.md');
        expect(document.title).toBe('标题');
        expect(document.plainText).toContain('这里是 markdown 内容');
        expect(document.markdownBody).toContain('# 标题');
    });
});
