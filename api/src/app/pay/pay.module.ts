import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PdfService } from '../invoices/pdf.service';
import { PayController, PayWebhookController } from './pay.controller';
import { PayService } from './pay.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [AccountingModule],
  controllers: [PayWebhookController, PayController],
  providers: [PayService, StripeService, PdfService],
  exports: [PayService],
})
export class PayModule {}
