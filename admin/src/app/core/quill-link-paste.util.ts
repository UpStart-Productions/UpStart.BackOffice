import Delta from 'quill-delta';
import { parseAppRecordDeepLink } from './quill-app-record-deep-link.util';
import { appLinkPath } from './simple-markdown.pipe';

const TRAILING_PUNCT = /[.,;:!?)}\]"']+$/;

const URL_BODY =
  /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

/** Trim trailing punctuation often copied with URLs. */
export function stripTrailingUrlPunctuation(url: string): string {
  return url.replace(TRAILING_PUNCT, '');
}

export function normalizePasteLinkHref(raw: string): string {
  const trimmed = stripTrailingUrlPunctuation(raw.trim());
  const inApp = appLinkPath(trimmed);
  if (inApp) return inApp;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function isPasteableUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  if (parseAppRecordDeepLink(t)) return false;
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return true;
  return appLinkPath(t) != null;
}

function pushText(delta: Delta, text: string): void {
  if (text) delta.insert(text);
}

/** Turn plain text into a Delta, linking http(s) and www. segments. */
export function linkifyPlainTextToDelta(text: string): Delta {
  const delta = new Delta();
  let last = 0;
  const pattern = new RegExp(URL_BODY.source, URL_BODY.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    if (start > last) pushText(delta, text.slice(last, start));
    const raw = stripTrailingUrlPunctuation(match[0]);
    if (parseAppRecordDeepLink(raw)) {
      pushText(delta, raw);
      continue;
    }
    const href = normalizePasteLinkHref(raw);
    delta.insert(raw, { link: href });
    last = start + match[0].length;
  }
  if (last < text.length) pushText(delta, text.slice(last));
  return delta;
}
