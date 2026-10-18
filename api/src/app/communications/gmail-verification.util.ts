const GMAIL_SENDER = 'forwarding-noreply@google.com';

/**
 * Gmail asks the owner of a forwarding target to confirm it. That message lands in our inbound
 * address, so we detect it and surface the code/link in Settings instead of filing it.
 *
 * ASSUMPTION (verify with a real confirmation email): sender is forwarding-noreply@google.com,
 * the subject contains "Gmail Forwarding Confirmation", and the body carries a numeric
 * "Confirmation code" plus a mail-settings.google.com link.
 */
export function isGmailForwardingConfirmation(
  fromEmail: string | null | undefined,
  subject: string | null | undefined,
): boolean {
  return (
    (fromEmail ?? '').toLowerCase() === GMAIL_SENDER &&
    /gmail forwarding confirmation/i.test(subject ?? '')
  );
}

export function parseGmailForwardingConfirmation(text: string | null | undefined): {
  gmailAddress: string | null;
  code: string | null;
  link: string | null;
} {
  const body = text ?? '';
  const address = body.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s+has requested/i);
  const code = body.match(/confirmation code\s*:?\s*(\d{4,})/i);
  const link = body.match(/https:\/\/mail-settings\.google\.com\/\S+/i);
  return {
    gmailAddress: address ? address[1].toLowerCase() : null,
    code: code ? code[1] : null,
    link: link ? link[0].replace(/[>)\].,]+$/, '') : null,
  };
}
