import {
  Body, Controller, Delete, Get, Param, Patch,
  Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { ServiceKeyService } from './service-key.service';
import { AccessGuard, AdminOnly } from '../access/access.guard';

class CreateServiceKeyDto {
  @IsString() @IsNotEmpty() name!: string;
}

@ApiTags('service-keys')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@AdminOnly()
@Controller('service-keys')
export class ServiceKeysController {
  constructor(private readonly keys: ServiceKeyService) {}

  @Get()
  list() {
    return this.keys.list();
  }

  /** Generate a new key. Returns the plain key — shown once, not stored. */
  @Post()
  generate(@Body() dto: CreateServiceKeyDto) {
    return this.keys.generate(dto.name);
  }

  /** Permanently delete a revoked key. */
  @Delete(':id/permanent')
  async deletePermanently(@Param('id') id: string) {
    await this.keys.deletePermanently(id);
    return { deleted: true };
  }

  /** Reinstate a revoked key. */
  @Patch(':id/reinstate')
  async reinstate(@Param('id') id: string) {
    await this.keys.reinstate(id);
    return { reinstated: true };
  }

  /** Revoke a key (soft-delete). */
  @Delete(':id')
  async revoke(@Param('id') id: string) {
    await this.keys.revoke(id);
    return { revoked: true };
  }
}
