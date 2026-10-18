/**
 * Separate a reply's new text from the history it quotes, so a reply-all chain doesn't show every
 * earlier message again on the timeline. Conservative: when unsure, keep the text. Never returns
 * an empty body (falls back to the original). Forwarded-message blocks are kept on purpose.
 */
export function stripQuotedText(text: string | null | undefined): { body: string | null; quoted: boolean } {
  if (!text) return { body: text ?? null, quoted: false };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const cut = findQuoteStart(lines);
  if (cut === null) return { body: text, quoted: false };
  const body = lines.slice(0, cut).join('\n').replace(/\s+$/, '');
  if (!body.trim()) return { body: text, quoted: false };
  return { body, quoted: true };
}

const GMAIL_ATTRIBUTION = /^On\s.+wrote:\s*$/i;
const ORIGINAL_MESSAGE = /^-{2,}\s*Original Message\s*-{2,}\s*$/i;
const OUTLOOK_RULE = /^_{20,}\s*$/;
const HEADER_FROM = /^\*?From:\*?\s+\S/i;
const HEADER_SENT = /^\*?(Sent|Date):\*?\s+\S/i;
const FORWARD_MARKER = /^(-{2,}\s*Forwarded message\s*-{2,}|Begin forwarded message:)\s*$/i;

function findQuoteStart(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? '').trim();

    // Everything from a forwarded message onward is content the sender meant to log.
    if (FORWARD_MARKER.test(line)) return null;

    // Gmail / Apple Mail: "On <date>, <name> wrote:" (sometimes wrapped onto two lines).
    if (GMAIL_ATTRIBUTION.test(line)) return i;
    if (/^On\s/i.test(line) && next && GMAIL_ATTRIBUTION.test(`${line} ${next}`)) return i;

    // Outlook: "-----Original Message-----"
    if (ORIGINAL_MESSAGE.test(line)) return i;

    // Outlook: a "From: ... / Sent: ..." header block, optionally under a ____ rule.
    if (OUTLOOK_RULE.test(line) && HEADER_FROM.test(next)) return i;
    if (HEADER_FROM.test(line) && i > 0) {
      const window = lines.slice(i + 1, i + 5).map((l) => l.trim());
      if (window.some((l) => HEADER_SENT.test(l))) return i;
    }

    // A trailing block of "> " quoted lines.
    if (line.startsWith('>')) {
      const rest = lines.slice(i).map((l) => l.trim()).filter(Boolean);
      if (rest.every((l) => l.startsWith('>'))) return i;
    }
  }
  return null;
}
