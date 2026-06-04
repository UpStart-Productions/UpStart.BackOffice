import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Response } from 'express';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { CreateInvoiceDto, CreateInvoiceLineItemDto } from './dto/create-invoice.dto';
import { InvoicePreviewQueryDto } from './dto/invoice-preview-query.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceFromTimeService } from './invoice-from-time.service';
import { PdfService } from './pdf.service';

const invoiceInclude = {
  client: true,
  lineItems: {
    include: { project: { select: { id: true, name: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithDetails = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    private readonly storageFolders: StorageFoldersService,
    private readonly invoiceFromTime: InvoiceFromTimeService,
  ) {}

  @Get('preview')
  async preview(@Query() query: InvoicePreviewQueryDto) {
    const client = await this.prisma.client.findUnique({ where: { id: query.clientId } });
    if (!client) throw new NotFoundException('Client not found');
    if (query.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: query.projectId, clientId: query.clientId },
      });
      if (!project) throw new NotFoundException('Project not found for this client');
    }
    return this.invoiceFromTime.buildPreview(query);
  }

  @Get()
  async list() {
    return this.prisma.invoice.findMany({
      include: { client: { select: { id: true, name: true, code: true } } },
      orderBy: { number: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateInvoiceDto) {
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) throw new NotFoundException('Client not found');

    await this.invoiceFromTime.assertTimeEntriesLinkable(dto.clientId, dto.lineItems);

    const lastInvoice = await this.prisma.invoice.findFirst({
      orderBy: { number: 'desc' },
    });
    const number = (lastInvoice?.number ?? 0) + 1;
    const displayNumber = `${client.code}-${String(number).padStart(4, '0')}`;

    const subtotal = dto.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = dto.taxRate ? subtotal * dto.taxRate : 0;
    const total = subtotal + taxAmount;

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          clientId: dto.clientId,
          number,
          displayNumber,
          issueDate: new Date(dto.issueDate),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          notes: dto.notes,
          subtotal,
          taxRate: dto.taxRate,
          taxAmount: taxAmount || undefined,
          total,
        },
      });

      await this.syncLineItems(tx, invoice.id, dto.lineItems);

      return tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: invoiceInclude,
      });
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be edited');
    }
    if (dto.lineItems !== undefined) {
      if (dto.lineItems.length === 0) {
        throw new BadRequestException('At least one line item is required');
      }
      await this.invoiceFromTime.assertTimeEntriesLinkable(existing.clientId, dto.lineItems);
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      if (dto.lineItems) {
        await tx.timeEntry.updateMany({
          where: { invoiceLineItem: { invoiceId: id } },
          data: { invoiceLineItemId: null },
        });
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        await this.syncLineItems(tx, id, dto.lineItems);
      }

      const subtotal = dto.lineItems
        ? dto.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
        : Number(existing.subtotal);
      const taxRate =
        dto.taxRate !== undefined
          ? dto.taxRate
          : existing.taxRate != null
            ? Number(existing.taxRate)
            : undefined;
      const taxAmount = taxRate ? subtotal * taxRate : 0;
      const total = subtotal + taxAmount;

      return tx.invoice.update({
        where: { id },
        data: {
          ...(dto.issueDate !== undefined && { issueDate: new Date(dto.issueDate) }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.lineItems || dto.taxRate !== undefined
            ? {
                subtotal,
                taxRate,
                taxAmount: taxAmount || undefined,
                total,
              }
            : {}),
          ...(dto.status !== undefined && {
            status: dto.status,
            ...(dto.status === 'SENT' && !existing.sentAt ? { sentAt: new Date() } : {}),
            ...(dto.status === 'PAID' && !existing.paidAt ? { paidAt: new Date() } : {}),
          }),
        },
        include: invoiceInclude,
      });
    });
    await this.generateAndStorePdf(invoice);
    return invoice;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Invoice not found');
    await this.storageFolders.removeInvoicePdf(existing.clientId, existing.displayNumber);
    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true };
  }

  @Get(':id/pdf')
  async downloadPdf(@Res() res: Response, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const pdfBuffer = await this.generateAndStorePdf(invoice);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.displayNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Post(':id/send')
  async send(@Param('id') id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Cannot send a void invoice');
    }
    if (!invoice.client.email) throw new BadRequestException('Client has no email address');

    const pdfBuffer = await this.generateAndStorePdf(invoice);
    const result = await this.mail.sendInvoice({
      to: invoice.client.email,
      toName: invoice.client.name,
      invoiceNumber: invoice.displayNumber,
      clientName: invoice.client.name,
      pdfBuffer,
      notes: invoice.notes ?? undefined,
    });

    if (result.sent) {
      await this.prisma.invoice.update({
        where: { id },
        data: {
          status: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
          sentAt: new Date(),
        },
      });
    }

    return { sent: result.sent, error: result.error };
  }

  private async syncLineItems(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    lineItems: CreateInvoiceLineItemDto[],
  ) {
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const amount = Math.round(item.quantity * item.unitPrice * 100) / 100;
      const line = await tx.invoiceLineItem.create({
        data: {
          invoiceId,
          projectId: item.projectId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount,
          sortOrder: item.sortOrder ?? i,
        },
      });

      const entryIds = item.timeEntryIds ?? [];
      if (entryIds.length > 0) {
        const updated = await tx.timeEntry.updateMany({
          where: { id: { in: entryIds }, invoiceLineItemId: null },
          data: { invoiceLineItemId: line.id },
        });
        if (updated.count !== entryIds.length) {
          throw new BadRequestException('One or more time entries could not be linked to the invoice');
        }
      }
    }
  }

  private async generateAndStorePdf(invoice: InvoiceWithDetails): Promise<Buffer> {
    const fromName = process.env.MAIL_FROM_NAME || 'UpStart Back Office';
    const pdfBuffer = await this.pdf.generateInvoicePdf(invoice, fromName);
    await this.storageFolders.saveInvoicePdf(
      invoice.clientId,
      invoice.displayNumber,
      pdfBuffer,
    );
    return pdfBuffer;
  }
}
