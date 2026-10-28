import { Module } from '@nestjs/common';
import { ExpenseCategoriesModule } from '../expense-categories/expense-categories.module';
import { ExpensesController } from './expenses.controller';

@Module({
  imports: [ExpenseCategoriesModule],
  controllers: [ExpensesController],
})
export class ExpensesModule {}
