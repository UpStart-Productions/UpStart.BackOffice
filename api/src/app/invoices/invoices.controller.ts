import {
  BadRequestException, Body, Req, Controller, Delete, Get, Logger, NotFoundException,
  Param, Post, Put, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { JournalPostingService } from '../accounting/journal-posting.service';
import { publicFromName } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { CreateInvoiceDto, CreateInvoiceLineItemDto } from './dto/create-invoice.dto';
import { InvoicePreviewQueryDto } from './dto/invoice-preview-query.dto';
import { MarkInvoicePaidDto } from './dto/mark-invoice-paid.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PayService } from '../pay/pay.service';
import { InvoiceFromTimeService } from './invoice-from-time.service';
import { buildProjectContacts } from './invoice-send-recipients.util';
import { PdfService } from './pdf.service';
import { currentTenantId } from '../tenancy/tenant-context';
import { AccessGuard, Area } from '../access/access.guard';

const projectContactSelect = {
  id: true,
  name: true,
  contacts: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const;

const sendRecipientsInclude = {
  client: { select: { name: true, email: true } },
  lineItems: {
    include: { project: { select: projectContactSelect } },
  },
} satisfies Prisma.InvoiceInclude;

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
@UseGuards(AccessGuard)
@Area('invoices')
@Controller('invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    private readonly storageFolders: StorageFoldersService,
    private readonly invoiceFromTime: InvoiceFromTimeService,
    private readonly journalPosting: JournalPostingService,
    private readonly pay: PayService,
    private readonly access: AccessService,
  ) {}

  /**
   * Own invoices when the role says so. Client invoices only for clients the user can reach;
   * invoices billed to the tenant have no client, so anyone at 'all' sees them.
   */
  private async scope(user: UserContext): Promise<Prisma.InvoiceWhereInput> {
    const clientIds = await this.access.clientIdFilter(user);
    return {
      ...(this.ownOnly(user) ? { createdById: user.id } : {}),
      ...(clientIds ? { OR: [{ clientId: clientIds }, { clientId: null }] } : {}),
    };
  }

  private ownOnly(user: UserContext): boolean {
    return this.access.level(user, 'invoices') === 'own';
  }

  /** The tenant as a bill-to: its name, address from the organization profile, and billing email. */
  private async tenantBillTo(): Promise<{ name: string; email: string | null; address: string | null }> {
    const tenantId = currentTenantId();
    const [tenant, profile] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      this.prisma.organizationProfile.findUnique({ where: { tenantId } }),
    ]);
    const cityLine = [[profile?.city, profile?.state].filter(Boolean).join(', '), profile?.zip].filter(Boolean).join(' ');
    return {
      name: tenant?.name ?? '',
      email: profile?.billingEmail?.trim() || null,
      address: [profile?.address, cityLine].filter(Boolean).join('\n') || null,
    };
  }

  private static clientBillTo(client: { name: string; email: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }) {
    const cityLine = [[client.city, client.state].filter(Boolean).join(', '), client.zip].filter(Boolean).join(' ');
    return {
      name: client.name,
      email: client.email?.trim() || null,
      address: [client.address, cityLine].filter(Boolean).join('\n') || null,
    };
  }

  /** Default bill-to for a new invoice billed to the tenant (the form prefills with it). */
  @Get('tenant-bill-to')
  tenantBillToDefault() {
    return this.tenantBillTo();
  }

  /** A client the user may invoice. Same not-found answer as a missing client. */
  private async requireClient(user: UserContext, clientId: string) {
    const clientIds = await this.access.clientIdFilter(user);
    const client = await this.prisma.client.findFirst({ where: { AND: [{ id: clientId }, clientIds ? { id: clientIds } : {}] } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  /** Unbilled time to invoice. Billing the tenant always uses only the user's own time; so does a role limited to its own invoices. */
  @Get('preview')
  async preview(@Req() req: Request, @Query() query: InvoicePreviewQueryDto) {
    const user = req.user as UserContext;
    const billTo = query.billTo ?? 'CLIENT';
    if (billTo === 'CLIENT') {
      if (!query.clientId) throw new BadRequestException('Choose a client');
      await this.requireClient(user, query.clientId);
    } else if (query.clientId) {
      await this.requireClient(user, query.clientId);
    }
    if (query.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: query.projectId, ...(query.clientId ? { clientId: query.clientId } : {}) },
      });
      if (!project) throw new NotFoundException('Project not found');
    }
    const userId = billTo === 'TENANT' || this.ownOnly(user) ? user.id : undefined;
    return this.invoiceFromTime.buildPreview({ ...query, billTo, userId });
  }

  @Get()
  async list(@Req() req: Request) {
    return this.prisma.invoice.findMany({
      where: await this.scope(req.user as UserContext),
      include: {
        client: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { number: 'desc' },
    });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateInvoiceDto) {
    const user = req.user as UserContext;
    const billTo = dto.billTo ?? 'CLIENT';
    let clientId: string | null = null;
    let prefix = 'INV';
    let defaults: { name: string; email: string | null; address: string | null };
    if (billTo === 'CLIENT') {
      if (!dto.clientId) throw new BadRequestException('Choose a client');
      const client = await this.requireClient(user, dto.clientId);
      clientId = client.id;
      prefix = client.code ?? 'INV';
      defaults = InvoicesController.clientBillTo(client);
    } else {
      defaults = await this.tenantBillTo();
    }

    await this.invoiceFromTime.assertTimeEntriesLinkable(
      { billTo, clientId, userId: billTo === 'TENANT' || this.ownOnly(user) ? user.id : null },
      dto.lineItems,
    );

    const lastInvoice = await this.prisma.invoice.findFirst({
      orderBy: { number: 'desc' },
    });
    const number = (lastInvoice?.number ?? 0) + 1;
    const displayNumber = `${prefix}-${String(number).padStart(4, '0')}`;

    const subtotal = dto.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = dto.taxRate ? subtotal * dto.taxRate : 0;
    const total = subtotal + taxAmount;

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          billTo,
          clientId,
          billToName: dto.billToName?.trim() || defaults.name,
          billToEmail: dto.billToEmail !== undefined ? dto.billToEmail.trim() || null : defaults.email,
          billToAddress: dto.billToAddress !== undefined ? dto.billToAddress.trim() || null : defaults.address,
          createdById: user.id,
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
  async get(@Req() req: Request, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...(await this.scope(req.user as UserContext)) },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be edited');
    }
    if (dto.lineItems !== undefined) {
      if (dto.lineItems.length === 0) {
        throw new BadRequestException('At least one line item is required');
      }
      const user = req.user as UserContext;
      await this.invoiceFromTime.assertTimeEntriesLinkable(
        {
          billTo: existing.billTo,
          clientId: existing.clientId,
          userId: existing.billTo === 'TENANT' ? existing.createdById : this.ownOnly(user) ? user.id : null,
        },
        dto.lineItems,
      );
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
          ...(dto.billToName !== undefined && { billToName: dto.billToName.trim() || null }),
          ...(dto.billToEmail !== undefined && { billToEmail: dto.billToEmail.trim() || null }),
          ...(dto.billToAddress !== undefined && { billToAddress: dto.billToAddress.trim() || null }),
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

    // existing.status is guaranteed 'DRAFT' here (guarded above), so any status change is a real transition.
    if (dto.status === 'SENT') {
      await this.journalPosting.postInvoiceIssued(invoice.id);
    }
    if (dto.status === 'VOID') {
      await this.journalPosting.reverseInvoiceIssued(invoice.id);
      await this.pay.cancelForInvoice(invoice.id);
    }

    await this.generateAndStorePdf(invoice);
    return invoice;
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const existing = await this.prisma.invoice.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!existing) throw new NotFoundException('Invoice not found');
    await this.storageFolders.removeInvoicePdf(existing.clientId, existing.displayNumber);
    await this.prisma.invoice.delete({ where: { id } });
    return { deleted: true };
  }

  @Get(':id/pdf')
  async downloadPdf(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...(await this.scope(req.user as UserContext)) },
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

  @Get(':id/send-recipients')
  async sendRecipients(@Req() req: Request, @Param('id') id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...(await this.scope(req.user as UserContext)) },
      include: sendRecipientsInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Cannot send a void invoice');
    }

    return {
      displayNumber: invoice.displayNumber,
      // The invoice's bill-to (the client, or the tenant when billing the tenant).
      client: {
        name: invoice.billToName || invoice.client?.name || '',
        email: invoice.billToEmail?.trim() || invoice.client?.email?.trim() || null,
      },
      projectContacts: buildProjectContacts(invoice.lineItems),
    };
  }

  @Post(':id/mark-paid')
  async markPaid(@Req() req: Request, @Param('id') id: string, @Body() dto: MarkInvoicePaidDto) {
    const existing = await this.prisma.invoice.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!existing) throw new NotFoundException('Invoice not found');
    if (existing.status !== 'SENT') {
      throw new BadRequestException('Only sent invoices can be marked as paid');
    }

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date(dto.paidAt),
        amountPaid: dto.amountPaid,
      },
      include: invoiceInclude,
    });

    await this.journalPosting.postInvoicePayment(invoice.id, dto.amountPaid, new Date(dto.paidAt));
    await this.pay.markPaidFromManual(invoice.id, new Date(dto.paidAt));

    return invoice;
  }

  @Post(':id/send')
  async send(@Req() req: Request, @Param('id') id: string, @Body() dto: SendInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, ...(await this.scope(req.user as UserContext)) },
      include: invoiceInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Cannot send a void invoice');
    }

    const to = dto.to.trim();

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.generateAndStorePdf(invoice);
    } catch (err) {
      this.logger.error(`Invoice PDF generation failed (${id}): ${err}`);
      return {
        sent: false,
        error: 'Could not generate the invoice PDF. Please try again in a moment.',
      };
    }

    const payUrl = await this.pay.payUrlForInvoice(invoice);
    const result = await this.mail.sendInvoice({
      to,
      toName: dto.toName?.trim() || undefined,
      invoiceNumber: invoice.displayNumber,
      clientName: invoice.billToName || invoice.client?.name || '',
      pdfBuffer,
      notes: invoice.notes ?? undefined,
      message: dto.message?.trim() || undefined,
      payUrl: payUrl ?? undefined,
      amountLabel: formatMoney(invoice.total),
      dueDate: invoice.dueDate
        ? invoice.dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        : undefined,
    });

    if (result.sent) {
      const wasDraft = invoice.status === 'DRAFT';
      await this.prisma.invoice.update({
        where: { id },
        data: {
          status: wasDraft ? 'SENT' : invoice.status,
          sentAt: new Date(),
        },
      });
      if (wasDraft) {
        await this.journalPosting.postInvoiceIssued(id);
      }
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
    const fromName = publicFromName(process.env.MAIL_FROM_NAME);
    const payUrl = await this.pay.payUrlForInvoice(invoice);
    const pdfBuffer = await this.pdf.generateInvoicePdf(invoice, fromName, payUrl);
    await this.storageFolders.saveInvoicePdf(
      invoice.clientId,
      invoice.displayNumber,
      pdfBuffer,
    );
    return pdfBuffer;
  }
}

function formatMoney(amount: { toString(): string } | number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount));
}
