import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRawEmail } from './email-parse.util';
import { isGmailForwardingConfirmation, parseGmailForwardingConfirmation } from './gmail-verification.util';

// NOTE: the fixture is modeled on Gmail's confirmation email from memory, not a real capture.
// Replace it with a real one once you have it.
describe('gmail forwarding confirmation', () => {
  it('detects and parses the confirmation message', async () => {
    const parsed = await parseRawEmail(
      readFileSync(path.join(__dirname, '__fixtures__/gmail-forwarding-confirmation.eml')),
    );
    expect(isGmailForwardingConfirmation(parsed.from?.email, parsed.subject)).toBe(true);
    expect(parseGmailForwardingConfirmation(parsed.text)).toEqual({
      gmailAddress: 'lori@example-tpn.test',
      code: '482913',
      link: 'https://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc123',
    });
  });
  it('does not flag ordinary mail', () => {
    expect(isGmailForwardingConfirmation('sally@familyclient.test', 'Gmail Forwarding Confirmation')).toBe(false);
  });
});
