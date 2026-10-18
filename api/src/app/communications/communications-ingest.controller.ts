import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { CommunicationsIngestService } from './communications-ingest.service';
import { IngestEmailDto } from './dto/ingest-email.dto';

@ApiTags('communications')
@Controller('communications')
export class CommunicationsIngestController {
  constructor(private readonly ingestService: CommunicationsIngestService) {}

  /**
   * Called by the inbound-email hop (SES -> S3 -> Lambda) or tools/ingest-eml.ts.
   * Protected by x-api-key via ServiceKeyGuard, same as POST /leads/ingest.
   */
  @Post('ingest-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceKeyGuard)
  ingest(@Body() dto: IngestEmailDto) {
    return this.ingestService.ingest(dto);
  }
}
