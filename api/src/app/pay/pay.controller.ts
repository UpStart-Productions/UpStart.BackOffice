import { Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PayService } from './pay.service';

@ApiTags('pay')
@Controller('pay')
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.pay.getPublicView(token);
  }

  @Get(':token/pdf')
  async pdf(@Param('token') token: string, @Res() res: Response) {
    const { buffer, filename } = await this.pay.getInvoicePdf(token);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Post(':token/checkout')
  checkout(@Param('token') token: string) {
    return this.pay.createCheckout(token);
  }

  @Post(':token/confirm')
  confirm(@Param('token') token: string) {
    return this.pay.confirmCheckout(token);
  }
}

@ApiTags('pay')
@Controller('pay/webhook')
export class PayWebhookController {
  constructor(private readonly pay: PayService) {}

  @Post()
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const raw = req.body;
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw));
    await this.pay.handleWebhook(buffer, signature);
    return { received: true };
  }
}
