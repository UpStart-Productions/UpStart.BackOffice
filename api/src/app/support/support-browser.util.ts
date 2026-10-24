/**
 * Lightweight User-Agent fingerprint for support emails (best-effort).
 */
export function summarizeBrowser(userAgentHeader: string | undefined): {
  family: string;
  version: string;
} {
  const ua = userAgentHeader?.trim() ?? '';
  if (!ua) {
    return { family: 'unknown', version: '' };
  }

  // Order matters — Edge/Chromium variants before generic Chrome/Safari.
  const checks: Array<{ re: RegExp; family: string }> = [
    { re: /Edg(?:e|)\/([\d.]+)/i, family: 'Microsoft Edge' },
    { re: /OPR\/([\d.]+)/i, family: 'Opera' },
    { re: /Firefox\/([\d.]+)/i, family: 'Firefox' },
    { re: /Chrome\/([\d.]+)/i, family: 'Chrome' }, // Chromecasts also match Chrome
    {
      re: /Version\/([\d.]+).*Safari\//i,
      family: 'Safari',
    },
  ];

  for (const { re, family } of checks) {
    const m = ua.match(re);
    if (m?.[1]) {
      const major = m[1].split('.')[0] ?? m[1];
      return { family, version: major };
    }
  }

  return { family: 'unknown', version: '' };
}
