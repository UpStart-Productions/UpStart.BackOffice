export const EMAIL_BRAND = {
  name: 'UpStart Productions',
  legalName: 'UpStart Productions, LLC',
  email: 'hello@heyupstart.com',
};

export const LOGO_CID = 'upstart-logo';

export function publicFromName(configured?: string | null): string {
  const name = configured?.trim();
  if (!name || /back office/i.test(name)) return EMAIL_BRAND.name;
  return name;
}

export type EmailFact = { label: string; value: string };
export type EmailSummaryRow = { label: string; value: string; strong?: boolean };

export function wrapClientEmail(params: {
  title: string;
  subtitle?: string;
  greeting?: string;
  intro?: string;
  facts?: EmailFact[];
  summaryRows?: EmailSummaryRow[];
  action?: { href: string; label: string };
  actionNote?: string;
  extraHtml?: string;
  closing?: string;
}): string {
  const facts = (params.facts ?? []).filter((f) => f.value.trim());
  const factCols = facts
    .map(
      (f) => `
        <td style="padding:0 16px 0 0;vertical-align:top;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#6b6b6b;font-weight:600;">${escapeHtml(f.label)}</p>
          <p style="margin:0;font-size:20px;line-height:1.3;color:#2d2d2d;font-weight:700;">${escapeHtml(f.value)}</p>
        </td>`,
    )
    .join('');

  const summaryRows = params.summaryRows ?? [];
  const summaryHtml = summaryRows.length
    ? `
    <p style="margin:28px 0 8px;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#2d2d2d;font-weight:700;">Summary</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:8px;">
      ${summaryRows
        .map((row, i) => {
          const last = i === summaryRows.length - 1;
          const weight = row.strong || last ? '700' : '400';
          const border = last ? '' : 'border-bottom:1px solid #e5e5e5;';
          return `<tr>
            <td style="padding:14px 16px;${border}font-size:14px;color:#2d2d2d;font-weight:${weight};">${escapeHtml(row.label)}</td>
            <td style="padding:14px 16px;${border}font-size:14px;color:#2d2d2d;font-weight:${weight};text-align:right;">${escapeHtml(row.value)}</td>
          </tr>`;
        })
        .join('')}
    </table>`
    : '';

  const actionHtml = params.action
    ? `
    <p style="margin:28px 0 8px;">
      <a href="${escapeHtml(params.action.href)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;">${escapeHtml(params.action.label)}</a>
    </p>
    ${params.actionNote ? `<p style="color:#6b6b6b;font-size:13px;line-height:1.5;margin:0 0 8px;">${escapeHtml(params.actionNote)}</p>` : ''}`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f5;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="background:#7c3aed;padding:8px 32px;">
      <p style="margin:0;font-size:12px;line-height:1.3;color:#ffffff;font-weight:500;letter-spacing:0.01em;">Technology that serves your mission.</p>
    </div>
    <div style="padding:28px 32px 0;">
      <img src="cid:${LOGO_CID}" alt="${escapeHtml(EMAIL_BRAND.name)}" width="180" style="display:block;height:48px;width:auto;border:0;" />
    </div>
    <div style="padding:24px 32px 32px;">
      <h1 style="margin:0 0 6px;font-size:26px;line-height:1.25;color:#2d2d2d;font-weight:600;">${escapeHtml(params.title)}</h1>
      ${params.subtitle ? `<p style="margin:0 0 24px;font-size:14px;color:#6b6b6b;">${escapeHtml(params.subtitle)}</p>` : ''}
      ${facts.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr>${factCols}</tr></table>` : ''}
      ${params.greeting ? `<p style="margin:28px 0 12px;font-size:15px;color:#2d2d2d;">${escapeHtml(params.greeting)}</p>` : ''}
      ${params.intro ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#2d2d2d;">${escapeHtml(params.intro)}</p>` : ''}
      ${summaryHtml}
      ${actionHtml}
      ${params.extraHtml ?? ''}
      ${params.closing ? `<p style="margin:28px 0 0;font-size:15px;color:#2d2d2d;">${escapeHtml(params.closing)}</p>` : ''}
    </div>
    <div style="padding:0 32px 28px;">
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:0 0 16px;" />
      <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#6b6b6b;">
        Questions? Contact us at
        <a href="mailto:${EMAIL_BRAND.email}" style="color:#5469d4;text-decoration:none;font-weight:600;">${EMAIL_BRAND.email}</a>.
      </p>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#8a8a8a;">
        You’re receiving this email from ${escapeHtml(EMAIL_BRAND.legalName)}.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function buildInvoiceEmailHtml(params: {
  toName?: string;
  invoiceNumber: string;
  amountLabel?: string;
  dueDate?: string;
  notes?: string;
  message?: string;
  payUrl?: string;
}): string {
  const extraParts: string[] = [];
  if (params.notes?.trim()) {
    extraParts.push(
      `<p style="margin:20px 0 0;padding-left:12px;border-left:3px solid #7c3aed;color:#6b6b6b;font-size:14px;line-height:1.5;">${escapeHtml(params.notes.trim())}</p>`,
    );
  }
  extraParts.push(
    `<p style="margin:20px 0 0;font-size:15px;color:#2d2d2d;">Your invoice PDF is attached.</p>`,
  );

  return wrapClientEmail({
    title: `Invoice from ${EMAIL_BRAND.name}`,
    subtitle: `Invoice #${params.invoiceNumber}`,
    greeting: params.toName ? `Hi ${params.toName},` : 'Hi,',
    intro: `Please find invoice ${params.invoiceNumber} attached.`,
    facts: [
      ...(params.amountLabel ? [{ label: 'Amount due', value: params.amountLabel }] : []),
      ...(params.dueDate ? [{ label: 'Due', value: params.dueDate }] : []),
    ],
    summaryRows: [
      { label: `Invoice ${params.invoiceNumber}`, value: params.amountLabel || '' },
      ...(params.amountLabel ? [{ label: 'Amount due', value: params.amountLabel, strong: true }] : []),
    ].filter((row) => row.value),
    action: params.payUrl
      ? { href: params.payUrl, label: 'Securely Pay Invoice' }
      : undefined,
    actionNote: params.payUrl
      ? 'This opens a secure payment page on our website. Stripe handles the transaction. We do not see or store your card or bank information.'
      : undefined,
    extraHtml: extraParts.join(''),
    closing: params.message?.trim() || 'Thank you for your business.',
  });
}

export function buildPaymentReceiptHtml(params: {
  toName?: string;
  invoiceNumber: string;
  amountLabel: string;
  paidOn: string;
  receiptNumber?: string | null;
}): string {
  return wrapClientEmail({
    title: `Receipt from ${EMAIL_BRAND.name}`,
    subtitle: params.receiptNumber ? `Receipt #${params.receiptNumber}` : `Invoice #${params.invoiceNumber}`,
    greeting: params.toName ? `Hi ${params.toName},` : 'Hi,',
    intro: `We received your payment for invoice ${params.invoiceNumber}. Your paid invoice is attached.`,
    facts: [
      { label: 'Amount paid', value: params.amountLabel },
      { label: 'Date paid', value: params.paidOn },
    ],
    summaryRows: [
      { label: `Invoice ${params.invoiceNumber}`, value: params.amountLabel },
      { label: 'Amount paid', value: params.amountLabel, strong: true },
    ],
    closing: 'Thank you for your business.',
  });
}

export function buildBookingEmailHtml(params: {
  title: string;
  greeting: string;
  intro: string;
  facts?: EmailFact[];
  extraHtml?: string;
}): string {
  return wrapClientEmail({
    title: params.title,
    greeting: params.greeting,
    intro: params.intro,
    facts: params.facts,
    extraHtml: params.extraHtml,
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
