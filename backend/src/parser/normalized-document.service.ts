import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { ConfigService } from '../config/config.service';
import type { NormalizedDocument } from './types/normalized-document.types';

@Injectable()
export class NormalizedDocumentService {
    constructor(private readonly configService: ConfigService) {}

    async writeDocument(document: NormalizedDocument): Promise<string> {
        await mkdir(this.configService.normalizedDocumentsPath, { recursive: true });

        const filePath = join(
            this.configService.normalizedDocumentsPath,
            `${document.fileId}.md`,
        );

        const frontmatter = stringify({
            file_id: document.fileId,
            source_path: document.sourcePath,
            source_type: document.sourceType,
            source_name: document.sourceName,
            title: document.title,
            metadata: document.metadata,
        }).trim();

        const content = `---\n${frontmatter}\n---\n\n${document.markdownBody.trim()}\n`;
        await writeFile(filePath, content, 'utf8');
        return filePath;
    }
}
