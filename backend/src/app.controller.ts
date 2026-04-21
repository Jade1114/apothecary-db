import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { IngestService } from './ingest/ingest.service';
import type { IngestRequest, IngestResponse } from './ingest/ingest.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly ingestService: IngestService,
  ) {}

  @Get('/health')
  getHealth(): { status: string } {
    return this.appService.getHealth();
  }

  @Post('/ingest')
  ingest(@Body() body: IngestRequest): IngestResponse {
    return this.ingestService.ingest(body);
  }
}
