/** Build a multipart/mixed MIME message for SES SendRawEmail (HTML + attachment). */
export function buildMultipartEmail(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachment: { filename: string; content: Buffer; contentType: string };
}): Buffer {
  const boundary = `----=_Part_${Date.now().toString(36)}`;
  const crlf = '\r\n';
  const base64Body = params.attachment.content
    .toString('base64')
    .replace(/(.{76})/g, `$1${crlf}`)
    .trim();

  const parts = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.html,
    '',
    `--${boundary}`,
    `Content-Type: ${params.attachment.contentType}; name="${escapeQuotes(params.attachment.filename)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${escapeQuotes(params.attachment.filename)}"`,
    '',
    base64Body,
    '',
    `--${boundary}--`,
    '',
  ];

  return Buffer.from(parts.join(crlf), 'utf8');
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function escapeQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
