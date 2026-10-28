import { Module } from '@nestjs/common';
import { ExpensePaymentMethodsController } from './expense-payment-methods.controller';
import { ExpensePaymentMethodsService } from './expense-payment-methods.service';

@Module({
  controllers: [ExpensePaymentMethodsController],
  providers: [ExpensePaymentMethodsService],
  exports: [ExpensePaymentMethodsService],
})
export class ExpensePaymentMethodsModule {}
