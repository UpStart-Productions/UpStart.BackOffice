import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';

const DEFAULT_FROM_EMAIL = 'noreply@upstartproductions.com';
const FROM_NAME = 'UpStart Back Office';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly ses: SESClient | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor() {
    const region = process.env.AWS_REGION?.trim() || 'us-west-2';
    const hasAwsCreds = process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim();

    if (hasAwsCreds) {
      this.ses = new SESClient({ region });
      this.fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
      this.fromName = process.env.MAIL_FROM_NAME?.trim() || FROM_NAME;
    } else {
      this.logger.warn('AWS credentials not set. Emails will not be sent.');
      this.fromEmail = DEFAULT_FROM_EMAIL;
      this.fromName = FROM_NAME;
    }
  }

  async sendInvoice(params: {
    to: string;
    toName?: string;
    invoiceNumber: string;
    clientName: string;
    pdfBuffer: Buffer;
    notes?: string;
  }): Promise<{ sent: boolean; error?: string }> {
    if (!this.ses) return { sent: false, error: 'Email not configured' };

    const subject = `Invoice ${params.invoiceNumber} from ${this.fromName}`;
    const html = this.buildInvoiceEmailHtml(params);

    try {
      // SES raw message for attachment support would require mime encoding.
      // For now send HTML body only; PDF download link can be added when file storage is wired.
      await this.ses.send(new SendEmailCommand({
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: { ToAddresses: [params.to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Html: { Data: html, Charset: 'UTF-8' } },
        },
      }));
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
    if (!this.ses) return { sent: false, error: 'Email not configured' };
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

  private buildInvoiceEmailHtml(params: {
    toName?: string;
    invoiceNumber: string;
    clientName: string;
    notes?: string;
  }): string {
    const greeting = params.toName ? `Hi ${params.toName},` : `Hi,`;
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fcfcfb;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fefefd;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;">
    <div style="background:#7c3aed;padding:16px 32px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#fff;letter-spacing:0.02em;">UpStart Back Office</p>
    </div>
    <div style="padding:32px;">
    <h2 style="color:#2d2d2d;margin-top:0;font-weight:500;">Invoice ${params.invoiceNumber}</h2>
    <p style="color:#2d2d2d;">${greeting}</p>
    <p style="color:#2d2d2d;">Please find invoice <strong>${params.invoiceNumber}</strong> from <strong>${this.fromName}</strong>.</p>
    ${params.notes ? `<p style="color:#6b6b6b;border-left:3px solid #7c3aed;padding-left:12px;">${params.notes}</p>` : ''}
    <p style="color:#6b6b6b;font-size:14px;margin-top:32px;">Questions? Reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
  }
}
