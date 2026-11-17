import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, AdminOnly, Area } from '../access/access.guard';
import { UpdateStripeConfigDto } from './dto/update-stripe-config.dto';
import { StripeIntegrationService } from './stripe-integration.service';
import { StripeService } from './stripe.service';

@ApiTags('stripe')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('invoices')
@AdminOnly()
@Controller('stripe')
export class StripeIntegrationController {
  constructor(
    private readonly stripe: StripeIntegrationService,
    private readonly stripeClient: StripeService,
  ) {}

  @Get('status')
  status() {
    return this.stripe.getStatus();
  }

  @Get('config')
  config() {
    return this.stripe.getConfig();
  }

  @Put('config')
  async saveConfig(@Body() dto: UpdateStripeConfigDto) {
    const config = await this.stripe.saveConfig(dto);
    this.stripeClient.clearClientCache();
    return config;
  }

  @Post('test')
  test() {
    return this.stripe.testConnection();
  }

  @Delete()
  async disconnect() {
    const status = await this.stripe.disconnect();
    this.stripeClient.clearClientCache();
    return status;
  }
}