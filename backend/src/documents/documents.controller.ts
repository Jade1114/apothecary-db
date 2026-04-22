import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';
import type {
    CreateDocumentResult,
    DocumentDetailResponse,
    DocumentsListResponse,
} from './types/document.types';

@Controller('documents')
export class DocumentsController {
    constructor(private readonly documentsService: DocumentsService) {}

    @Get()
    getDocuments(): DocumentsListResponse {
        return {
            documents: this.documentsService.listDocuments(),
        };
    }

    @Get(':id')
    getDocumentById(
        @Param('id', ParseIntPipe) id: number,
    ): DocumentDetailResponse {
        return {
            document: this.documentsService.getDocumentById(id),
        };
    }

    @Post()
    createDocument(@Body() body: CreateDocumentDto): CreateDocumentResult {
        return this.documentsService.createDocument(body.content ?? '');
    }
}
