import { Module, forwardRef } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PayController, PayWebhookController } from './pay.controller';
import { PayService } from './pay.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [AccountingModule, forwardRef(() => InvoicesModule)],
  controllers: [PayWebhookController, PayController],
  providers: [PayService, StripeService],
  exports: [PayService],
})
export class PayModule {}
