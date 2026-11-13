import { Inject, Injectable, forwardRef } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { publicFromName } from '../mail/email-layout';
import { PayService } from '../pay/pay.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { PdfService } from './pdf.service';

const invoiceInclude = {
  client: true,
  lineItems: {
    include: { project: { select: { id: true, name: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.InvoiceInclude;

export type InvoiceForPdf = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

/** Single path: pdfmake render + optional S3 cache update. */
@Injectable()
export class InvoicePdfDeliveryService {
  constructor(
    private readonly pdf: PdfService,
    @Inject(forwardRef(() => PayService)) private readonly pay: PayService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  async renderAndStore(invoice: InvoiceForPdf): Promise<Buffer> {
    const fromName = publicFromName(process.env.MAIL_FROM_NAME);
    const payUrl = await this.pay.payUrlForInvoice(invoice);
    const pdfBuffer = await this.pdf.generateInvoicePdf(invoice, fromName, payUrl);
    await this.storageFolders.saveInvoicePdf(invoice.clientId, invoice.displayNumber, pdfBuffer);
    return pdfBuffer;
  }
}
