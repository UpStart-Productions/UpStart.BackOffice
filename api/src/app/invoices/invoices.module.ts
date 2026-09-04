import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayModule } from '../pay/pay.module';
import { InvoiceFromTimeService } from './invoice-from-time.service';
import { InvoicesController } from './invoices.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [AccountingModule, PayModule],
  controllers: [InvoicesController],
  providers: [PdfService, InvoiceFromTimeService],
  exports: [PdfService],
})
export class InvoicesModule {}
