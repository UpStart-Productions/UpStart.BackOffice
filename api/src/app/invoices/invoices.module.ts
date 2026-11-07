import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayModule } from '../pay/pay.module';
import { InvoiceFromTimeService } from './invoice-from-time.service';
import { InvoicePipelineService } from './invoice-pipeline.service';
import { InvoicesController } from './invoices.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [AccountingModule, PayModule, NotificationsModule],
  controllers: [InvoicesController],
  providers: [PdfService, InvoiceFromTimeService, InvoicePipelineService],
  exports: [PdfService],
})
export class InvoicesModule {}
