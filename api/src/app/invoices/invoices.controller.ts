import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContext } from '../workspace/workspace.types';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PdfService } from './pdf.service';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('workspaces/:workspaceSlug/invoices')
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
  ) {}

  private workspace(req: Request) {
    return (req as Request & { workspace?: WorkspaceContext }).workspace!;
  }

  @Get()
  async list(@Req() req: Request) {
    const ws = this.workspace(req);
    return this.prisma.invoice.findMany({
      where: { workspaceId: ws.id },
      include: { client: { select: { id: true, name: true, code: true } } },
      orderBy: { number: 'desc' },
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateInvoiceDto) {
    const ws = this.workspace(req);

    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, workspaceId: ws.id } });
    if (!client) throw new NotFoundException('Client not found');

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { workspaceId: ws.id },
      orderBy: { number: 'desc' },
    });
    const number = (lastInvoice?.number ?? 0) + 1;
    const displayNumber = `${client.code}-${String(number).padStart(4, '0')}`;

    const subtotal = dto.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = dto.taxRate ? subtotal * dto.taxRate : 0;
    const total = subtotal + taxAmount;

    return this.prisma.invoice.create({
      data: {
        workspaceId: ws.id,
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
        lineItems: {
          create: dto.lineItems.map((item, i) => ({
            projectId: item.projectId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.quantity * item.unitPrice,
            sortOrder: item.sortOrder ?? i,
          })),
        },
      },
      include: {
        client: true,
        lineItems: { include: { project: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, workspaceId: ws.id },
      include: {
        client: true,
        lineItems: { include: { project: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    const ws = this.workspace(req);
    const existing = await this.prisma.invoice.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw new NotFoundException('Invoice not found');
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...(dto.issueDate !== undefined && { issueDate: new Date(dto.issueDate) }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.taxRate !== undefined && { taxRate: dto.taxRate }),
        ...(dto.status !== undefined && {
          status: dto.status,
          ...(dto.status === 'SENT' && !existing.sentAt ? { sentAt: new Date() } : {}),
          ...(dto.status === 'PAID' && !existing.paidAt ? { paidAt: new Date() } : {}),
        }),
      },
      include: {
        client: true,
        lineItems: { include: { project: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const existing = await this.prisma.invoice.findFirst({ where: { id, workspaceId: ws.id } });
    if (!existing) throw new NotFoundException('Invoice not found');
    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true };
  }

  @Get(':id/pdf')
  async downloadPdf(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    const ws = this.workspace(req);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, workspaceId: ws.id },
      include: {
        client: true,
        lineItems: { include: { project: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const fromName = process.env.MAIL_FROM_NAME || 'UpStart Back Office';
    const pdfBuffer = await this.pdf.generateInvoicePdf(invoice, fromName);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.displayNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Post(':id/send')
  async send(@Req() req: Request, @Param('id') id: string) {
    const ws = this.workspace(req);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, workspaceId: ws.id },
      include: {
        client: true,
        lineItems: { include: { project: { select: { id: true, name: true } } }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!invoice.client.email) throw new BadRequestException('Client has no email address');

    const fromName = process.env.MAIL_FROM_NAME || 'UpStart Back Office';
    const result = await this.mail.sendInvoice({
      to: invoice.client.email,
      toName: invoice.client.name,
      invoiceNumber: invoice.displayNumber,
      clientName: invoice.client.name,
      notes: invoice.notes ?? undefined,
    });

    if (result.sent) {
      await this.prisma.invoice.update({
        where: { id },
        data: { status: 'SENT', sentAt: invoice.sentAt ?? new Date() },
      });
    }

    return { sent: result.sent, error: result.error };
  }
}
