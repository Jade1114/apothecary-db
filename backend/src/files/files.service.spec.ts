import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/database.service';
import { FilesService } from './files.service';

describe('FilesService', () => {
    let databaseService: DatabaseService;
    let filesService: FilesService;
    let vaultPath: string;

    beforeEach(async () => {
        process.env.DATABASE_PATH = ':memory:';
        vaultPath = join(tmpdir(), `apothecary-files-${Date.now()}`);
        process.env.APOTHECARY_VAULT_PATH = vaultPath;
        await mkdir(vaultPath, { recursive: true });

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigModule, DatabaseModule],
            providers: [FilesService],
        }).compile();

        databaseService = module.get(DatabaseService);
        databaseService.onModuleInit();
        filesService = module.get(FilesService);
    });

    it('should observe a new file without confirming it as indexed', async () => {
        await writeFile(join(vaultPath, 'alpha.md'), '# Alpha', 'utf8');

        const registration = await filesService.registerFile('alpha.md');
        const file = filesService.getFileById(registration.file.id);

        expect(registration.shouldProcess).toBe(true);
        expect(registration.reason).toBe('new');
        expect(file.observed_hash).toBeTruthy();
        expect(file.indexed_hash).toBeNull();
        expect(file.hash).toBeNull();
        expect(file.status).toBe('error');
        expect(file.observed_at).toBeTruthy();
        expect(file.indexed_at).toBeNull();
    });

    it('should only update indexed hash after processing succeeds', async () => {
        await writeFile(join(vaultPath, 'beta.md'), '# Beta', 'utf8');

        const firstRegistration = await filesService.registerFile('beta.md');
        filesService.markProcessed(firstRegistration.file.id);
        const processed = filesService.getFileById(firstRegistration.file.id);

        expect(processed.hash).toBe(processed.observed_hash);
        expect(processed.indexed_hash).toBe(processed.observed_hash);
        expect(processed.status).toBe('active');
        expect(processed.indexed_at).toBeTruthy();

        await writeFile(join(vaultPath, 'beta.md'), '# Beta changed', 'utf8');
        const secondRegistration = await filesService.registerFile('beta.md');
        const changed = filesService.getFileById(secondRegistration.file.id);

        expect(secondRegistration.shouldProcess).toBe(true);
        expect(secondRegistration.reason).toBe('changed');
        expect(changed.observed_hash).not.toBe(processed.indexed_hash);
        expect(changed.indexed_hash).toBe(processed.indexed_hash);
        expect(changed.hash).toBe(processed.indexed_hash);
        expect(changed.status).toBe('error');
    });

    it('should backfill observed and indexed hashes from legacy hash', () => {
        const database = databaseService.getDatabase();
        database
            .prepare(
                "INSERT INTO files (path, name, extension, kind, size, hash, status) VALUES (?, ?, ?, ?, ?, ?, 'active')",
            )
            .run('/tmp/legacy.md', 'legacy.md', 'md', 'markdown', 10, 'legacy-hash');

        databaseService.onModuleInit();

        const row = database
            .prepare('SELECT hash, observed_hash, indexed_hash, observed_at, indexed_at FROM files WHERE path = ?')
            .get('/tmp/legacy.md') as {
            hash: string;
            observed_hash: string;
            indexed_hash: string;
            observed_at: string | null;
            indexed_at: string | null;
        };

        expect(row.observed_hash).toBe(row.hash);
        expect(row.indexed_hash).toBe(row.hash);
        expect(row.observed_at).toBeTruthy();
        expect(row.indexed_at).toBeTruthy();
    });
});
