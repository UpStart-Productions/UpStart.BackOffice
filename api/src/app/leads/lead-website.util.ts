/** Hostname for dedup, e.g. "example.org" from "https://www.example.org/about" */
export function normalizeWebsiteDomain(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const full = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return new URL(full).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

/** Store a consistent https URL on the lead when possible. */
export function normalizeWebsiteForStorage(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
