import { LOGO_CID } from './email-layout';

/** Build a MIME message for SES SendRawEmail (HTML + optional CID logo + optional attachment). */
export function buildMultipartEmail(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  logo?: { content: Buffer; contentType?: string };
  attachment?: { filename: string; content: Buffer; contentType: string };
}): Buffer {
  const crlf = '\r\n';
  const mixed = `----=_Mixed_${Date.now().toString(36)}`;
  const related = `----=_Related_${Date.now().toString(36)}`;

  const htmlPart = [
    `--${related}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.html,
    '',
  ];

  const logoPart = params.logo
    ? [
        `--${related}`,
        `Content-Type: ${params.logo.contentType || 'image/png'}; name="upstart-logo.png"`,
        'Content-Transfer-Encoding: base64',
        `Content-ID: <${LOGO_CID}>`,
        'Content-Disposition: inline; filename="upstart-logo.png"',
        '',
        foldBase64(params.logo.content),
        '',
      ]
    : [];

  const relatedBlock = [
    `Content-Type: multipart/related; boundary="${related}"`,
    '',
    ...htmlPart,
    ...logoPart,
    `--${related}--`,
    '',
  ];

  const attachmentPart = params.attachment
    ? [
        `--${mixed}`,
        `Content-Type: ${params.attachment.contentType}; name="${escapeQuotes(params.attachment.filename)}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${escapeQuotes(params.attachment.filename)}"`,
        '',
        foldBase64(params.attachment.content),
        '',
      ]
    : [];

  const parts = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    ...relatedBlock,
    ...attachmentPart,
    `--${mixed}--`,
    '',
  ];

  return Buffer.from(parts.join(crlf), 'utf8');
}

function foldBase64(content: Buffer): string {
  return content.toString('base64').replace(/(.{76})/g, `$1\r\n`).trim();
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, 'utf8').toString('base64');
  return `=?UTF-8?B?${b64}?=`;
}

function escapeQuotes(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
