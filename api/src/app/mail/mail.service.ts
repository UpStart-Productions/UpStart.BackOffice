import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand, SendRawEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { resolveExplicitAwsCredentials } from '../common/aws-credentials.util';
import { buildMultipartEmail } from './mime-email.util';

const DEFAULT_FROM_EMAIL = 'noreply@upstartproductions.com';
const FROM_NAME = 'UpStart Back Office';

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
    this.fromName = process.env.MAIL_FROM_NAME?.trim() || FROM_NAME;
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
  }): Promise<{ sent: boolean; error?: string }> {
    const subject = `Invoice ${params.invoiceNumber} from ${this.fromName}`;
    const html = this.buildInvoiceEmailHtml(params);

    try {
      const from = `${this.fromName} <${this.fromEmail}>`;
      const raw = buildMultipartEmail({
        from,
        to: params.to,
        subject,
        html,
        attachment: {
          filename: `${params.invoiceNumber}.pdf`,
          content: params.pdfBuffer,
          contentType: 'application/pdf',
        },
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
      this.logger.error(`Failed to send invoice email: ${String(err)}`);
      return { sent: false, error: String(err) };
    }
  }

  async sendRaw(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ sent: boolean; error?: string }> {
    try {
      await this.ses.send(new SendEmailCommand({
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: { ToAddresses: [params.to] },
        Message: {
          Subject: { Data: params.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: params.html, Charset: 'UTF-8' } },
        },
      }));
      return { sent: true };
    } catch (err) {
      this.logger.error(`Failed to send email: ${String(err)}`);
      return { sent: false, error: String(err) };
    }
  }

  async sendWithAttachment(params: {
    to: string;
    subject: string;
    html: string;
    attachment: { filename: string; content: Buffer; contentType: string };
  }): Promise<{ sent: boolean; error?: string }> {
    try {
      const from = `${this.fromName} <${this.fromEmail}>`;
      const raw = buildMultipartEmail({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
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
      this.logger.error(`Failed to send email with attachment: ${String(err)}`);
      return { sent: false, error: String(err) };
    }
  }

  private buildInvoiceEmailHtml(params: {
    toName?: string;
    invoiceNumber: string;
    clientName: string;
    notes?: string;
    message?: string;
    payUrl?: string;
  }): string {
    const greeting = params.toName ? `Hi ${params.toName},` : `Hi,`;
    const closing = params.message?.trim()
      ? `<p style="color:#2d2d2d;margin-top:28px;">${escapeHtml(params.message.trim()).replace(/\r\n/g, '\n').replace(/\n/g, '<br>')}</p>`
      : `<p style="color:#2d2d2d;margin-top:28px;">Thank you for your business.</p>`;
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fcfcfb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fefefd;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;">
    <div style="background:#7c3aed;padding:16px 32px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#fff;letter-spacing:0.02em;">${process.env.MAIL_FROM_NAME?.trim() || 'Back Office'}</p>
    </div>
    <div style="padding:32px;">
    <h2 style="color:#2d2d2d;margin-top:0;font-weight:500;">Invoice ${params.invoiceNumber}</h2>
    <p style="color:#2d2d2d;">${greeting}</p>
    <p style="color:#2d2d2d;">Please find invoice <strong>${params.invoiceNumber}</strong> attached to this email.</p>
    ${params.notes ? `<p style="color:#6b6b6b;border-left:3px solid #7c3aed;padding-left:12px;">${params.notes}</p>` : ''}
    ${closing}
    <p style="color:#2d2d2d;margin-top:16px;line-height:1.5;">${process.env.MAIL_FROM_NAME?.trim() || 'Back Office'}</p>
    ${params.payUrl ? `
    <p style="margin:28px 0 8px;">
      <a href="${escapeHtml(params.payUrl)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;">Securely Pay Invoice</a>
    </p>
    <p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin:0 0 8px;">This will open a secure payment page on our website. Stripe securely handles your transaction. UpStart Productions does not see or store your card or bank information.</p>` : ''}
    <p style="color:#6b6b6b;font-size:14px;margin-top:${params.payUrl ? '16px' : '28px'};">Questions? Reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
