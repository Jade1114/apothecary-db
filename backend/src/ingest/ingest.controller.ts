import { Body, Controller, Post } from '@nestjs/common';
import { IngestService } from './ingest.service';
import type { IngestRequest, IngestResponse } from './ingest.service';

@Controller()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('ingest')
  ingest(@Body() body: IngestRequest): IngestResponse {
    return this.ingestService.ingest(body);
  }
}
