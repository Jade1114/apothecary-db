import { Module } from '@nestjs/common';
import { NormalizedDocumentService } from './normalized-document.service';
import { ParserService } from './parser.service';

@Module({
    providers: [ParserService, NormalizedDocumentService],
    exports: [ParserService, NormalizedDocumentService],
})
export class ParserModule {}
