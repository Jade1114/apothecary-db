import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';

export type IngestRequest = {
  content: string;
  sourceType?: string;
  sourceName?: string | null;
};

export type IngestResponse = {
  success: true;
  documentId: number;
  chunkCount: number;
  sourceType: string;
  sourceName: string | null;
};

@Injectable()
export class IngestService {
  constructor(private readonly documentsService: DocumentsService) {}

  ingest(request: IngestRequest): IngestResponse {
    const cleanedContent = request.content.trim();
    if (!cleanedContent) {
      throw new BadRequestException('content 不能为空');
    }

    const chunks = this.splitIntoChunks(cleanedContent);
    const created = this.documentsService.createDocument(cleanedContent);

    return {
      success: true,
      documentId: created.documentId,
      chunkCount: chunks.length,
      sourceType: request.sourceType ?? 'text',
      sourceName: request.sourceName ?? null,
    };
  }

  private splitIntoChunks(content: string): string[] {
    return content
      .split('\n\n')
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  }
}
