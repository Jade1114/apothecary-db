import { Body, Controller, Post } from '@nestjs/common';
import { IngestDto } from './dto/ingest.dto';
import { IngestFileDto } from './dto/ingest-file.dto';
import { IngestService } from './ingest.service';
import type { FileIngestResponse } from './types/file-ingest.types';
import type { IngestResponse } from './types/ingest.types';
import type { VaultScanResponse } from './types/vault-scan.types';

@Controller()
export class IngestController {
    constructor(private readonly ingestService: IngestService) {}

    @Post('ingest')
    async ingest(@Body() body: IngestDto): Promise<IngestResponse> {
        return this.ingestService.ingest(body);
    }

    @Post('ingest/file')
    async ingestFile(@Body() body: IngestFileDto): Promise<FileIngestResponse> {
        return this.ingestService.ingestFile(body);
    }

    @Post('ingest/vault-scan')
    async scanVault(): Promise<VaultScanResponse> {
        return this.ingestService.scanVault();
    }
}
