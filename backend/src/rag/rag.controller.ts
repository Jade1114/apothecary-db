import { Body, Controller, Post } from '@nestjs/common';
import { QueryRagDto } from './dto/query-rag.dto';
import { RagService } from './rag.service';
import type { RagQueryResponse } from './types/rag.types';

@Controller('rag')
export class RagController {
    constructor(private readonly ragService: RagService) {}

    @Post('query')
    async query(@Body() body: QueryRagDto): Promise<RagQueryResponse> {
        return this.ragService.query(body);
    }
}
