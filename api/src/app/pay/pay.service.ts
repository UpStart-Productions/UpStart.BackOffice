import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Invoice, Payable } from '@prisma/client';
import Stripe from 'stripe';
import { JournalPostingService } from '../accounting/journal-posting.service';
import { PdfService } from '../invoices/pdf.service';
import { publicFromName } from '../mail/email-layout';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { invoicePdfKey } from '../storage/storage-keys.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import {
  buildPayUrl,
  canAcceptPayment,
  centsToDollars,
  dollarsToCents,
  generatePayToken,
  integrationIdentifier,
  isStripeConfigured,
  uniqueProjectsFromLineItems,
} from './pay.util';
import { formatReceiptDate, resolveReceiptPayer } from './pay-receipt.util';
import { StripeService } from './stripe.service';

type InvoiceForPay = Pick<Invoice, 'id' | 'displayNumber' | 'status' | 'total'> & {
  client?: { email?: string | null } | null;
};

type PayInvoice = Invoice & {
  client?: { email?: string | null } | null;
  lineItems?: {
    project?: { id: string; name: string; description: string | null } | null;
  }[];
};

type PayableForView = Payable & { invoice: PayInvoice | null };

@Injectable()
export class PayService {
  private readonly logger = new Logger(PayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly journalPosting: JournalPostingService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  isConfigured(): boolean {
    return isStripeConfigured();
  }

  async getPublicView(token: string) {
    const payable = await this.reconcileByToken(token);
    return this.toPublicView(payable);
  }

  async confirmCheckout(token: string) {
    const payable = await this.reconcileByToken(token);
    return this.toPublicView(payable);
  }

  async getInvoicePdf(token: string): Promise<{ buffer: Buffer; filename: string }> {
    const payable = await this.findByToken(token);
    if (!payable.invoiceId) {
      throw new NotFoundException('Invoice not found');
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: payable.invoiceId },
      include: {
        client: true,
        lineItems: {
          include: { project: { select: { id: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const key = invoicePdfKey(invoice.clientId, invoice.displayNumber);
    const filename = `${invoice.displayNumber}.pdf`;
    if (await this.storage.exists(key)) {
      return { buffer: await this.storage.read(key), filename };
    }

    const fromName = publicFromName(process.env.MAIL_FROM_NAME);
    const payUrl = await this.payUrlForInvoice(invoice);
    const buffer = await this.pdf.generateInvoicePdf(invoice, fromName, payUrl);
    await this.storage.upload({
      buffer,
      key,
      mimeType: 'application/pdf',
    });
    return { buffer, filename };
  }

  async createCheckout(token: string): Promise<{ clientSecret: string }> {
    if (!this.stripe.isConfigured()) {
      throw new ServiceUnavailableException('Card payments are not configured');
    }

    const payable = await this.findByToken(token);
    const invoice = payable.invoice;
    if (!canAcceptPayment({ payableStatus: payable.status, invoiceStatus: invoice?.status })) {
      throw new BadRequestException('This item is already paid');
    }

    if (payable.stripeCheckoutSessionId) {
      const existing = await this.stripe.retrieveCheckoutSession(payable.stripeCheckoutSessionId);
      if (existing.status === 'open' && existing.client_secret) {
        return { clientSecret: existing.client_secret };
      }
      if (existing.status === 'complete') {
        await this.fulfillCheckoutSession(existing);
        throw new BadRequestException('This item is already paid');
      }
    }

    const amountCents = dollarsToCents(Number(payable.amount));
    if (amountCents < 50) {
      throw new BadRequestException('Amount is too small to charge by card');
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.createEmbeddedCheckout({
        title: payable.title,
        amountCents,
        currency: payable.currency,
        customerEmail: invoice?.client?.email,
        metadata: {
          payableId: payable.id,
          kind: payable.kind,
          invoiceId: payable.invoiceId ?? '',
        },
        integrationIdentifier: integrationIdentifier(payable.kind),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start checkout';
      this.logger.error(`Stripe checkout create failed: ${message}`);
      throw new BadRequestException(message);
    }

    await this.prisma.payable.update({
      where: { id: payable.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    if (!session.client_secret) {
      throw new ServiceUnavailableException('Could not start checkout');
    }
    return { clientSecret: session.client_secret };
  }

  async handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.constructWebhookEvent(rawBody, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature failed: ${String(err)}`);
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (
      event.type !== 'checkout.session.completed' &&
      event.type !== 'checkout.session.async_payment_succeeded'
    ) {
      this.logger.log(`Ignoring Stripe webhook ${event.type}`);
      return;
    }

    this.logger.log(`Fulfilling Stripe webhook ${event.type}`);
    const session = event.data.object as Stripe.Checkout.Session;
    await this.fulfillCheckoutSession(session);
  }

  async getOrCreateForInvoice(invoice: InvoiceForPay): Promise<Payable | null> {
    if (!this.isConfigured()) return null;
    if (invoice.status === 'VOID' || invoice.status === 'PAID') {
      return this.prisma.payable.findUnique({ where: { invoiceId: invoice.id } });
    }

    const existing = await this.prisma.payable.findUnique({ where: { invoiceId: invoice.id } });
    const title = `Invoice ${invoice.displayNumber}`;
    const amount = Number(invoice.total);
    if (existing) {
      if (existing.status === 'OPEN' && Number(existing.amount) !== amount) {
        return this.prisma.payable.update({
          where: { id: existing.id },
          data: { title, amount },
        });
      }
      return existing;
    }

    return this.prisma.payable.create({
      data: {
        token: generatePayToken(),
        kind: 'INVOICE',
        title,
        amount,
        currency: 'usd',
        invoiceId: invoice.id,
      },
    });
  }

  async payUrlForInvoice(invoice: InvoiceForPay): Promise<string | null> {
    const payable = await this.getOrCreateForInvoice(invoice);
    if (!payable || payable.status !== 'OPEN') return null;
    if (invoice.status === 'VOID' || invoice.status === 'PAID') return null;
    return buildPayUrl(payable.token);
  }

  async markPaidFromManual(invoiceId: string, paidAt: Date): Promise<void> {
    await this.prisma.payable.updateMany({
      where: { invoiceId, status: 'OPEN' },
      data: { status: 'PAID', paidAt },
    });
  }

  async cancelForInvoice(invoiceId: string): Promise<void> {
    await this.prisma.payable.updateMany({
      where: { invoiceId, status: 'OPEN' },
      data: { status: 'CANCELED' },
    });
  }

  private async findByToken(token: string) {
    const payable = await this.prisma.payable.findUnique({
      where: { token },
      include: {
        invoice: {
          include: {
            client: { select: { email: true } },
            lineItems: {
              include: { project: { select: { id: true, name: true, description: true } } },
            },
          },
        },
      },
    });
    if (!payable) throw new NotFoundException('Payment link not found');
    return payable;
  }

  private async reconcileByToken(token: string) {
    const payable = await this.findByToken(token);
    if (payable.status === 'PAID' || payable.invoice?.status === 'PAID') {
      return payable;
    }
    if (!payable.stripeCheckoutSessionId || !this.stripe.isConfigured()) {
      return payable;
    }

    try {
      const session = await this.stripe.retrieveCheckoutSession(payable.stripeCheckoutSessionId);
      if (session.status === 'complete' || session.payment_status === 'paid') {
        await this.fulfillCheckoutSession(session);
        return this.findByToken(token);
      }
    } catch (err) {
      this.logger.warn(`Could not reconcile checkout for ${payable.id}: ${String(err)}`);
    }
    return payable;
  }

  private toPublicView(payable: PayableForView) {
    const invoicePaid = payable.invoice?.status === 'PAID';
    const alreadyPaid = payable.status === 'PAID' || invoicePaid;
    const unavailable = payable.status === 'CANCELED' || payable.invoice?.status === 'VOID';
    return {
      token: payable.token,
      kind: payable.kind,
      title: payable.title,
      amount: Number(payable.amount),
      currency: payable.currency,
      status: alreadyPaid ? 'PAID' : unavailable ? 'UNAVAILABLE' : 'OPEN',
      publishableKey: this.stripe.publishableKey(),
      paymentsEnabled: this.stripe.isConfigured(),
      projects: uniqueProjectsFromLineItems(payable.invoice?.lineItems ?? []) || [],
      invoiceNumber: payable.invoice?.displayNumber ?? null,
      dueDate: payable.invoice?.dueDate?.toISOString() ?? null,
    };
  }

  private async fulfillCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return;
    }

    const payableId = session.metadata?.payableId || session.client_reference_id;
    if (!payableId) {
      this.logger.warn(`Checkout session ${session.id} has no payable id`);
      return;
    }

    const payable = await this.prisma.payable.findUnique({
      where: { id: payableId },
      include: { invoice: true },
    });
    if (!payable) {
      this.logger.warn(`Payable ${payableId} not found for session ${session.id}`);
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    const amountPaid = session.amount_total != null ? centsToDollars(session.amount_total) : Number(payable.amount);
    const paidAt = new Date();

    if (payable.status === 'PAID' || payable.invoice?.status === 'PAID') {
      const isSameIntent = paymentIntentId && payable.stripePaymentIntentId === paymentIntentId;
      if (!isSameIntent && paymentIntentId) {
        this.logger.warn(`Duplicate payment for payable ${payable.id}; refunding ${paymentIntentId}`);
        await this.stripe.refundPaymentIntent(paymentIntentId);
        return;
      }
      await this.sendPaymentReceiptIfNeeded(payable.id, session.id);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payable.update({
        where: { id: payable.id },
        data: {
          status: 'PAID',
          paidAt,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        },
      });

      if (payable.invoiceId) {
        await tx.invoice.update({
          where: { id: payable.invoiceId },
          data: {
            status: 'PAID',
            paidAt,
            amountPaid,
            ...(payable.invoice?.status === 'DRAFT' ? { sentAt: payable.invoice.sentAt ?? paidAt } : {}),
          },
        });
      }
    });

    if (payable.invoiceId) {
      if (payable.invoice?.status === 'DRAFT') {
        await this.journalPosting.postInvoiceIssued(payable.invoiceId);
      }
      await this.journalPosting.postInvoicePayment(payable.invoiceId, amountPaid, paidAt);
    }

    await this.sendPaymentReceiptIfNeeded(payable.id, session.id);
  }

  private async sendPaymentReceiptIfNeeded(payableId: string, sessionId: string): Promise<void> {
    const payable = await this.prisma.payable.findUnique({
      where: { id: payableId },
      include: {
        invoice: { include: { client: { select: { email: true, name: true } } } },
      },
    });
    if (!payable || payable.receiptEmailedAt || !payable.invoice) {
      return;
    }

    let receiptNumber: string | null = payable.stripeReceiptNumber;
    let receiptUrl: string | null = payable.stripeReceiptUrl;
    let payerEmail = payable.invoice.client?.email?.trim() || '';
    let payerName = payable.invoice.client?.name?.trim() || '';

    try {
      const details = await this.stripe.getReceiptDetails(sessionId);
      receiptNumber = details.receiptNumber || receiptNumber;
      receiptUrl = details.receiptUrl || receiptUrl;
      payerEmail = details.payerEmail || payerEmail;
      payerName = details.payerName || payerName;
    } catch (err) {
      this.logger.warn(`Could not load Stripe receipt details for ${payable.id}: ${String(err)}`);
    }

    const payer = resolveReceiptPayer(
      { customer_details: { email: payerEmail, name: payerName } },
      payable.invoice.client,
    );
    if (!payer) {
      this.logger.warn(`No recipient for payment receipt ${payable.id}`);
      return;
    }

    let pdfBuffer: Buffer;
    try {
      const pdf = await this.getInvoicePdf(payable.token);
      pdfBuffer = pdf.buffer;
    } catch (err) {
      this.logger.error(`Receipt PDF failed for ${payable.id}: ${String(err)}`);
      return;
    }

    const paidAt = payable.paidAt ?? new Date();
    const result = await this.mail.sendPaymentReceipt({
      to: payer.email,
      toName: payer.name || undefined,
      invoiceNumber: payable.invoice.displayNumber,
      amountLabel: this.formatReceiptAmount(Number(payable.amount), payable.currency),
      paidOn: formatReceiptDate(paidAt),
      receiptNumber,
      pdfBuffer,
    });

    if (!result.sent) {
      this.logger.error(`Payment receipt email failed for ${payable.id}: ${result.error}`);
      return;
    }

    await this.prisma.payable.update({
      where: { id: payable.id },
      data: {
        stripeReceiptNumber: receiptNumber,
        stripeReceiptUrl: receiptUrl,
        receiptEmailedAt: new Date(),
      },
    });
  }

  private formatReceiptAmount(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (currency || 'usd').toUpperCase(),
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  }
}
