import { BadRequestException, Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { ConfigService } from '../config/config.service';
import type { NormalizedDocument } from './types/normalized-document.types';

@Injectable()
export class ParserService {
    constructor(private readonly configService: ConfigService) {}

    async parseFile(inputPath: string): Promise<NormalizedDocument> {
        const sourcePath = this.resolveVaultPath(inputPath);
        await access(sourcePath);

        const extension = extname(sourcePath).toLowerCase();
        const stats = await stat(sourcePath);
        const fileBuffer = await readFile(sourcePath);
        const hash = createHash('sha256').update(fileBuffer).digest('hex');
        const generatedAt = new Date().toISOString();
        const sourceName = basename(sourcePath);

        switch (extension) {
            case '.txt':
                return this.createNormalizedDocument({
                    sourcePath,
                    sourceName,
                    sourceType: 'txt',
                    extension,
                    hash,
                    size: stats.size,
                    generatedAt,
                    parser: 'text-file-parser',
                    parserVersion: 'v1',
                    rawText: fileBuffer.toString('utf8').trim(),
                });
            case '.md':
                return this.createNormalizedDocument({
                    sourcePath,
                    sourceName,
                    sourceType: 'md',
                    extension,
                    hash,
                    size: stats.size,
                    generatedAt,
                    parser: 'markdown-file-parser',
                    parserVersion: 'v1',
                    rawText: this.markdownToPlainText(
                        fileBuffer.toString('utf8'),
                    ),
                    markdownBody: fileBuffer.toString('utf8').trim(),
                    title: this.extractMarkdownTitle(
                        fileBuffer.toString('utf8'),
                    ),
                });
            case '.pdf': {
                const parser = new PDFParse({ data: fileBuffer });
                const textResult = await parser.getText();
                const infoResult = await parser.getInfo();
                await parser.destroy();

                return this.createNormalizedDocument({
                    sourcePath,
                    sourceName,
                    sourceType: 'pdf',
                    extension,
                    hash,
                    size: stats.size,
                    generatedAt,
                    parser: 'pdf-file-parser',
                    parserVersion: 'v1',
                    rawText: textResult.text.trim(),
                    title:
                        typeof infoResult.info?.Title === 'string'
                            ? infoResult.info.Title
                            : null,
                });
            }
            case '.docx': {
                const parsed = await mammoth.extractRawText({
                    buffer: fileBuffer,
                });
                return this.createNormalizedDocument({
                    sourcePath,
                    sourceName,
                    sourceType: 'docx',
                    extension,
                    hash,
                    size: stats.size,
                    generatedAt,
                    parser: 'docx-file-parser',
                    parserVersion: 'v1',
                    rawText: parsed.value.trim(),
                });
            }
            default:
                throw new BadRequestException(
                    `当前暂不支持该文件类型: ${extension || 'unknown'}`,
                );
        }
    }

    private createNormalizedDocument(input: {
        sourcePath: string;
        sourceName: string;
        sourceType: 'txt' | 'md' | 'pdf' | 'docx';
        extension: string;
        hash: string;
        size: number;
        generatedAt: string;
        parser: string;
        parserVersion: string;
        rawText: string;
        markdownBody?: string;
        title?: string | null;
    }): NormalizedDocument {
        const plainText = input.rawText.trim();
        if (!plainText) {
            throw new BadRequestException(
                `文件内容为空，无法导入: ${input.sourceName}`,
            );
        }

        const title =
            input.title ??
            this.extractTitleFromText(plainText) ??
            basename(input.sourceName, input.extension);

        return {
            fileId: input.hash.slice(0, 16),
            sourcePath: input.sourcePath,
            sourceType: input.sourceType,
            sourceName: input.sourceName,
            title,
            plainText,
            markdownBody:
                input.markdownBody ?? this.textToMarkdownBody(plainText, title),
            metadata: {
                extension: input.extension.replace('.', ''),
                hash: input.hash,
                size: input.size,
                parser: input.parser,
                parserVersion: input.parserVersion,
                generatedAt: input.generatedAt,
            },
        };
    }

    private resolveVaultPath(inputPath: string): string {
        const resolvedPath = isAbsolute(inputPath)
            ? resolve(inputPath)
            : resolve(this.configService.vaultPath, inputPath);
        const relativePath = relative(
            this.configService.vaultPath,
            resolvedPath,
        );

        if (relativePath.startsWith('..') || relativePath === '') {
            if (resolvedPath !== resolve(this.configService.vaultPath)) {
                throw new BadRequestException(
                    '只允许导入 Apothecary Vault 目录中的文件',
                );
            }
        }

        return resolvedPath;
    }

    private markdownToPlainText(content: string): string {
        return content
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/^[-*+]\s+/gm, '')
            .replace(/\r\n/g, '\n')
            .trim();
    }

    private extractMarkdownTitle(content: string): string | null {
        const match = content.match(/^#\s+(.+)$/m);
        return match?.[1]?.trim() ?? null;
    }

    private extractTitleFromText(content: string): string | null {
        const firstLine = content
            .split('\n')
            .map((line) => line.trim())
            .find(Boolean);
        return firstLine ? firstLine.slice(0, 80) : null;
    }

    private textToMarkdownBody(content: string, title: string | null): string {
        const body = content
            .split(/\n{2,}/)
            .map((chunk) => chunk.trim())
            .filter(Boolean)
            .join('\n\n');

        return title ? `# ${title}\n\n${body}` : body;
    }
}
