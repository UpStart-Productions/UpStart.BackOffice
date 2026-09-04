import { Injectable, Logger } from '@nestjs/common';
import { SendRawEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { resolveExplicitAwsCredentials } from '../common/aws-credentials.util';
import { getUpstartLogoPng } from '../invoices/brand-logo';
import { EMAIL_BRAND, buildInvoiceEmailHtml, buildPaymentReceiptHtml, publicFromName } from './email-layout';
import { buildMultipartEmail } from './mime-email.util';

const DEFAULT_FROM_EMAIL = 'hello@heyupstart.com';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly ses: SESClient;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    const region = process.env.AWS_REGION?.trim() || 'us-west-2';
    const credentials = resolveExplicitAwsCredentials();
    this.ses = new SESClient({
      region,
      ...(credentials ? { credentials } : {}),
    });
    this.fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
    this.fromName = publicFromName(process.env.MAIL_FROM_NAME);
    const credSource = credentials
      ? 'env keys'
      : process.env.AWS_PROFILE?.trim()
        ? `profile ${process.env.AWS_PROFILE.trim()}`
        : 'default AWS credential chain';
    this.logger.log(`SES ready (region=${region}, from=${this.fromEmail}, ${credSource})`);
  }

  async sendInvoice(params: {
    to: string;
    toName?: string;
    invoiceNumber: string;
    clientName: string;
    pdfBuffer: Buffer;
    notes?: string;
    message?: string;
    payUrl?: string;
    amountLabel?: string;
    dueDate?: string;
  }): Promise<{ sent: boolean; error?: string }> {
    const subject = `Invoice ${params.invoiceNumber} from ${EMAIL_BRAND.name}`;
    const html = buildInvoiceEmailHtml(params);
    return this.sendMime({
      to: params.to,
      subject,
      html,
      attachment: {
        filename: `${params.invoiceNumber}.pdf`,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    });
  }

  async sendPaymentReceipt(params: {
    to: string;
    toName?: string;
    invoiceNumber: string;
    amountLabel: string;
    paidOn: string;
    receiptNumber?: string | null;
    pdfBuffer: Buffer;
  }): Promise<{ sent: boolean; error?: string }> {
    const subject = `Receipt for Invoice ${params.invoiceNumber} from ${EMAIL_BRAND.name}`;
    const html = buildPaymentReceiptHtml(params);
    return this.sendMime({
      to: params.to,
      subject,
      html,
      attachment: {
        filename: `${params.invoiceNumber}.pdf`,
        content: params.pdfBuffer,
        contentType: 'application/pdf',
      },
    });
  }

  async sendRaw(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ sent: boolean; error?: string }> {
    return this.sendMime(params);
  }

  async sendWithAttachment(params: {
    to: string;
    subject: string;
    html: string;
    attachment: { filename: string; content: Buffer; contentType: string };
  }): Promise<{ sent: boolean; error?: string }> {
    return this.sendMime(params);
  }

  private async sendMime(params: {
    to: string;
    subject: string;
    html: string;
    attachment?: { filename: string; content: Buffer; contentType: string };
  }): Promise<{ sent: boolean; error?: string }> {
    try {
      const logo = getUpstartLogoPng();
      const raw = buildMultipartEmail({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(logo ? { logo: { content: logo, contentType: 'image/png' } } : {}),
        attachment: params.attachment,
      });
      await this.ses.send(
        new SendRawEmailCommand({
          Source: this.fromEmail,
          Destinations: [params.to],
          RawMessage: { Data: raw },
        }),
      );
      return { sent: true };
    } catch (err) {
      this.logger.error(`Failed to send email: ${String(err)}`);
      return { sent: false, error: String(err) };
    }
  }
}
