import { Module, forwardRef } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayModule } from '../pay/pay.module';
import { InvoiceFromTimeService } from './invoice-from-time.service';
import { InvoicePdfDeliveryService } from './invoice-pdf-delivery.service';
import { InvoicePipelineService } from './invoice-pipeline.service';
import { InvoicesController } from './invoices.controller';
import { PdfService } from './pdf.service';

@Module({
  imports: [AccountingModule, forwardRef(() => PayModule), NotificationsModule],
  controllers: [InvoicesController],
  providers: [PdfService, InvoicePdfDeliveryService, InvoiceFromTimeService, InvoicePipelineService],
  exports: [PdfService, InvoicePdfDeliveryService],
})
export class InvoicesModule {}
