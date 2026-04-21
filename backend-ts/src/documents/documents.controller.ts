import { Body, Controller, Get, Post } from '@nestjs/common';
import { DocumentRecord, DocumentsService } from './documents.service';

type CreateDocumentRequest = {
  content: string;
};

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  getDocuments(): { documents: DocumentRecord[] } {
    return {
      documents: this.documentsService.listDocuments(),
    };
  }

  @Post()
  createDocument(@Body() body: CreateDocumentRequest): { documentId: number } {
    return this.documentsService.createDocument(body.content ?? '');
  }
}
