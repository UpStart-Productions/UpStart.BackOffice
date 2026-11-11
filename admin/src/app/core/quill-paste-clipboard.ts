import Delta from 'quill-delta';
import type Quill from 'quill';
import { anchorTextLooksLikeUrl, parseAppRecordDeepLink } from './quill-app-record-deep-link.util';
import {
  isPasteableUrl,
  linkifyPlainTextToDelta,
  normalizePasteLinkHref,
} from './quill-link-paste.util';
import { buildQuillRecordMention } from './quill-mention-paste.util';
import type { QuillPasteService } from './quill-paste.service';

type ClipboardConstructor = new (
  quill: InstanceType<typeof Quill>,
  options?: { matchers?: Array<[string | number, unknown]> },
) => {
  convert: (
    input: { html?: string; text?: string },
    formats?: Record<string, unknown>,
  ) => Delta;
  onCapturePaste: (e: ClipboardEvent) => void;
  quill: InstanceType<typeof Quill>;
  addMatcher: (selector: string | number, matcher: (node: Node, delta: Delta, scroll: unknown) => Delta) => void;
};

const patchedClipboards = new WeakSet<object>();

function pasteText(e: ClipboardEvent): string | undefined {
  let text = e.clipboardData?.getData('text/plain') ?? undefined;
  if (!text?.trim()) {
    const urlList = e.clipboardData?.getData('text/uri-list');
    if (urlList) {
      text = urlList
        .split(/\r?\n/)
        .filter((line) => line.trim() && line[0] !== '#')[0]
        ?.trim();
    }
  }
  return text;
}

function labelHintFromPasteHtml(html: string | undefined): string | undefined {
  if (!html?.trim()) return undefined;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchor = doc.body.querySelector('a[href]');
  if (!anchor) return undefined;
  const label = anchor.textContent?.trim();
  const href = anchor.getAttribute('href') ?? '';
  if (!label || anchorTextLooksLikeUrl(label, href)) return undefined;
  return label;
}

function insertMentionAtRange(
  quill: InstanceType<typeof Quill>,
  range: { index: number; length: number },
  mention: Record<string, unknown>,
  QuillCtor: typeof Quill,
): void {
  const delta = new Delta()
    .retain(range.index)
    .delete(range.length)
    .insert({ mention })
    .insert(' ');
  quill.updateContents(delta, QuillCtor.sources.USER);
  quill.setSelection(range.index + 2, QuillCtor.sources.SILENT);
  quill.scrollSelectionIntoView();
}

function recordRefFromPasteHtml(html: string | undefined): ReturnType<typeof parseAppRecordDeepLink> {
  if (!html?.trim()) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchor = doc.body.querySelector('a[href]');
  if (!anchor) return null;
  return parseAppRecordDeepLink(anchor.getAttribute('href') ?? '');
}

function matchRecordLinkAnchor(node: Node, delta: Delta): Delta {
  if (!(node instanceof HTMLAnchorElement)) return delta;
  const href = node.getAttribute('href') ?? node.href;
  const ref = parseAppRecordDeepLink(href);
  if (!ref) return delta;
  const hint = anchorTextLooksLikeUrl(node.textContent?.trim() ?? '', href)
    ? undefined
    : node.textContent?.trim();
  return new Delta().insert({
    mention: buildQuillRecordMention(ref, hint ?? ''),
  });
}

function matchPasteLinkText(node: Node, delta: Delta): Delta {
  if (!(node instanceof Text)) return delta;
  if (node.parentElement?.closest('a, pre, code')) return delta;
  const text = node.data;
  if (!text || !/(https?:\/\/|www\.)/i.test(text)) return delta;
  if (parseAppRecordDeepLink(text.trim())) return delta;
  return linkifyPlainTextToDelta(text);
}

/** Paste: in-app record URLs → @mention embed with API title; other URLs → Quill links. */
export function registerQuillPasteClipboard(
  QuillCtor: typeof import('quill').default,
  pasteService: QuillPasteService,
): void {
  const Clipboard = QuillCtor.import('modules/clipboard') as ClipboardConstructor;
  if (patchedClipboards.has(Clipboard as object)) return;
  patchedClipboards.add(Clipboard as object);

  const Original = Clipboard.prototype.convert;
  Clipboard.prototype.convert = function (
    input: { html?: string; text?: string },
    formats: Record<string, unknown> = {},
  ) {
    const html = input?.html;
    const text = input?.text;
    if (!html && text != null) {
      const trimmed = text.trim();
      if (trimmed) {
        const record = parseAppRecordDeepLink(trimmed);
        if (record) {
          return new Delta().insert({
            mention: buildQuillRecordMention(record, ''),
          });
        }
        if (isPasteableUrl(trimmed)) {
          return new Delta().insert(trimmed, { link: normalizePasteLinkHref(trimmed) });
        }
      }
      if (/(https?:\/\/|www\.)/i.test(text)) {
        return linkifyPlainTextToDelta(text);
      }
    }
    return Original.call(this, input, formats);
  };

  const originalCapture = Clipboard.prototype.onCapturePaste;
  Clipboard.prototype.onCapturePaste = function (this: InstanceType<ClipboardConstructor>, e: ClipboardEvent) {
    if (e.defaultPrevented || !this.quill.isEnabled()) return;

    const html = e.clipboardData?.getData('text/html');
    const text = pasteText(e)?.trim();
    const record =
      (text ? parseAppRecordDeepLink(text) : null) ?? recordRefFromPasteHtml(html || undefined);

    if (record) {
      e.preventDefault();
      const range = this.quill.getSelection(true);
      if (range == null) return;
      const quill = this.quill;
      const labelHint = labelHintFromPasteHtml(html);
      void pasteService.recordMentionForPaste(record, labelHint).then((mention) => {
        insertMentionAtRange(quill, range, mention, QuillCtor);
      });
      return;
    }

    originalCapture.call(this, e);
  };

  class ClipboardWithPasteMatchers extends (Clipboard as unknown as typeof Clipboard) {
    constructor(quill: InstanceType<typeof QuillCtor>, options?: { matchers?: Array<[string | number, unknown]> }) {
      super(quill, options);
      this.addMatcher('a', matchRecordLinkAnchor);
      this.addMatcher(Node.TEXT_NODE, matchPasteLinkText);
    }
  }

  QuillCtor.register('modules/clipboard', ClipboardWithPasteMatchers, true);
}
