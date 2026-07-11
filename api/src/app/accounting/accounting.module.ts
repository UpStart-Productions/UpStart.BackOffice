import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { BankImportController } from './bank-import.controller';
import { JournalController } from './journal.controller';
import { JournalPostingService } from './journal-posting.service';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [AccountsController, JournalController, BankImportController, ReportsController],
  providers: [JournalPostingService],
  exports: [JournalPostingService],
})
export class AccountingModule {}
