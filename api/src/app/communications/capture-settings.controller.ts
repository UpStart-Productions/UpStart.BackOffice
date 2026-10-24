import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CaptureSettingsService } from './capture-settings.service';
import { SetCaptureAliasDto, SetInternalDomainsDto } from './dto/communications.dto';
import { AccessGuard, AdminOnly } from '../access/access.guard';

/** Settings > Email capture. Admin only: it exposes forwarding confirmation codes. */
@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@AdminOnly()
@Controller('communications/capture-settings')
export class CaptureSettingsController {
  constructor(private readonly settings: CaptureSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put('alias')
  setAlias(@Body() dto: SetCaptureAliasDto) {
    return this.settings.setAlias(dto.alias);
  }

  @Put('internal-domains')
  setInternalDomains(@Body() dto: SetInternalDomainsDto) {
    return this.settings.setInternalDomains(dto.domains);
  }
}
