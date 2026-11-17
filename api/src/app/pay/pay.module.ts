import { Module, forwardRef } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { StripeIntegrationController } from './stripe-integration.controller';
import { StripeIntegrationService } from './stripe-integration.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [AccountingModule, forwardRef(() => InvoicesModule)],
  controllers: [PayController, StripeIntegrationController],
  providers: [PayService, StripeService, StripeIntegrationService],
  exports: [PayService],
})
export class PayModule {}
