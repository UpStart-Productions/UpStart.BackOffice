import { Module } from '@nestjs/common';
import { InvoiceFromTimeService } from './invoice-from-time.service';
import { InvoicesController } from './invoices.controller';
import { PdfService } from './pdf.service';

@Module({
  controllers: [InvoicesController],
  providers: [PdfService, InvoiceFromTimeService],
})
export class InvoicesModule {}
