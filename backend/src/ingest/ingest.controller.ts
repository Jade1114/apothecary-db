import { Body, Controller, Post } from '@nestjs/common';
import { IngestDto } from './dto/ingest.dto';
import { IngestService } from './ingest.service';
import type { IngestResponse } from './types/ingest.types';

@Controller()
export class IngestController {
    constructor(private readonly ingestService: IngestService) {}

    @Post('ingest')
    async ingest(@Body() body: IngestDto): Promise<IngestResponse> {
        return this.ingestService.ingest(body);
    }
}
