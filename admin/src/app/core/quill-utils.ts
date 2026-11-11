import { environment } from '../../environments/environment';

/**
 * Replaces non-breaking spaces in Quill HTML with regular spaces so text wraps correctly.
 * Quill 2.0.3+ converts spaces to &nbsp; in editor HTML export; ngx-quill uses that for form values.
 */
const NBSP_HTML_ENTITY =
  /(?:&nbsp;|&#0*160;|&#x0*A0;|&#x0*a0;)/gi;

function apiOrigin(): string {
  return environment.apiBaseUrl.replace(/\/api\/?$/, '');
}

/** Rewrite stored `/api/uploads/...` paths for display in the admin app. */
export function resolveQuillContentAssetUrls(html: string): string {
  if (!html.includes('/api/uploads/')) return html;
  const origin = apiOrigin();
  return html
    .replace(/src="(\/api\/uploads\/[^"]+)"/g, (_, path: string) => `src="${origin}${path}"`)
    .replace(/href="(\/api\/uploads\/[^"]+)"/g, (_, path: string) => `href="${origin}${path}"`)
    .replace(/data-url="(\/api\/uploads\/[^"]+)"/g, (_, path: string) => `data-url="${origin}${path}"`);
}

/** Store API-relative upload paths instead of environment-specific absolute URLs. */
function normalizeQuillContentAssetUrls(html: string): string {
  if (!html.includes('/api/uploads/')) return html;
  const origin = apiOrigin().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html
    .replace(new RegExp(`src="${origin}(/api/uploads/[^"]+)"`, 'g'), 'src="$1"')
    .replace(new RegExp(`href="${origin}(/api/uploads/[^"]+)"`, 'g'), 'href="$1"')
    .replace(new RegExp(`data-url="${origin}(/api/uploads/[^"]+)"`, 'g'), 'data-url="$1"');
}

export function quillHtmlToBreakable(html: string | null | undefined): string {
  if (html == null || typeof html !== 'string') return '';
  const spaced = html.replace(NBSP_HTML_ENTITY, ' ').replace(/\u00A0/g, ' ');
  return normalizeQuillContentAssetUrls(spaced);
}

type QuillConstructor = {
  prototype: {
    getSemanticHTML: (...args: unknown[]) => string;
  };
  import: (path: string) => unknown;
  new (container: HTMLElement, options?: Record<string, unknown>): {
    editor: { constructor: { prototype: { getHTML?: (...args: unknown[]) => string } } };
  };
};

const patchedQuillConstructors = new WeakSet<object>();

/** Patch Quill export/import so HTML never serializes or reloads spaces as &nbsp;. */
export function patchQuillBreakableSpaces(Quill: QuillConstructor): void {
  if (patchedQuillConstructors.has(Quill)) return;
  patchedQuillConstructors.add(Quill);

  const container = document.createElement('div');
  const instance = new Quill(container, {
    theme: 'snow',
    modules: { toolbar: false },
  });
  const editorProto = Object.getPrototypeOf(instance.editor) as {
    getHTML?: (...args: unknown[]) => string;
  };
  if (typeof editorProto.getHTML === 'function') {
    const originalGetHTML = editorProto.getHTML;
    editorProto.getHTML = function (this: unknown, ...args: unknown[]) {
      return dedupeQuillMentionGhostText(quillHtmlToBreakable(originalGetHTML.apply(this, args)));
    };
  }
  container.remove();

  const originalGetSemanticHTML = Quill.prototype.getSemanticHTML;
  Quill.prototype.getSemanticHTML = function (this: unknown, ...args: unknown[]) {
    return dedupeQuillMentionGhostText(quillHtmlToBreakable(originalGetSemanticHTML.apply(this, args)));
  };

  const Clipboard = Quill.import('modules/clipboard') as {
    prototype: {
      convert: (
        input: { html?: string; text?: string },
        formats?: Record<string, unknown>,
      ) => unknown;
    };
  } | null;
  if (Clipboard?.prototype?.convert) {
    const originalConvert = Clipboard.prototype.convert;
    Clipboard.prototype.convert = function (
      input: { html?: string; text?: string },
      formats?: Record<string, unknown>,
    ) {
      if (input?.html) {
        input = { ...input, html: quillHtmlToBreakable(input.html) };
      }
      return originalConvert.call(this, input, formats);
    };
  }
}

/** ngx-quill internals we monkey-patch (getter is private on QuillEditorBase). */
interface NgxQuillEditorProto {
  writeValue: (value: unknown) => void;
  getter: (quillEditor: unknown, forceFormat?: string) => unknown;
  format: () => string | undefined;
  service: { config: { format?: string } };
  quillEditor?: unknown;
  onModelChange?: (value: unknown) => void;
  valueGetter: () => (editor: unknown, forceFormat?: string) => unknown;
}

let ngxQuillPatched = false;

function resolveQuillFormat(
  formatFn: () => string | undefined,
  configFormat: string | undefined,
  forceFormat?: string,
): string {
  return forceFormat || formatFn() || configFormat || 'html';
}

/** Patch ngx-quill so every editor reads/writes breakable HTML through reactive forms. */
export function patchNgxQuillBreakableSpaces(QuillEditorBaseClass: object): void {
  if (ngxQuillPatched) return;
  ngxQuillPatched = true;

  const proto = (QuillEditorBaseClass as { prototype: NgxQuillEditorProto }).prototype;

  const originalGetter = proto.getter;
  proto.getter = function (
    this: NgxQuillEditorProto,
    quillEditor,
    forceFormat,
  ) {
    const value = originalGetter.call(this, quillEditor, forceFormat);
    const format = resolveQuillFormat(
      this.format.bind(this),
      this.service.config.format,
      forceFormat,
    );
    if (format === 'html' && typeof value === 'string') {
      return dedupeQuillMentionGhostText(quillHtmlToBreakable(value));
    }
    return value;
  };

  const originalWriteValue = proto.writeValue;
  proto.writeValue = function (
    this: NgxQuillEditorProto,
    currentValue: unknown,
  ) {
    const format = resolveQuillFormat(this.format.bind(this), this.service.config.format);
    let normalized = currentValue;
    if (format === 'html' && typeof currentValue === 'string') {
      normalized = resolveQuillContentAssetUrls(
        dedupeQuillMentionGhostText(quillHtmlToBreakable(currentValue)),
      );
    }
    // Display only: loading a value never changes the form's model.
    originalWriteValue.call(this, normalized);
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readMentionDataAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\bdata-${name}="([^"]+)"`, 'i'));
  return match?.[1]?.trim() ?? null;
}

const MENTION_TYPES: Record<string, { path: (id: string, attrs: string) => string; className: string }> = {
  task: {
    className: 'mention mention--task',
    path: (id, attrs) => {
      const projectId = readMentionDataAttr(attrs, 'project-id') ?? readMentionDataAttr(attrs, 'projectId');
      return projectId ? `/tasks/projects/${escapeHtml(projectId)}?task=${escapeHtml(id)}` : `/tasks`;
    },
  },
  project: {
    className: 'mention mention--project',
    path: (id) => `/tasks/projects/${escapeHtml(id)}`,
  },
  crmProject: {
    className: 'mention mention--project',
    path: (id) => `/projects/${escapeHtml(id)}`,
  },
  client: {
    className: 'mention mention--client',
    path: (id) => `/clients/${escapeHtml(id)}`,
  },
  invoice: {
    className: 'mention mention--invoice',
    path: (id) => `/invoices/${escapeHtml(id)}`,
  },
  contact: {
    className: 'mention mention--contact',
    path: (id) => `/people/${escapeHtml(id)}`,
  },
};

function mentionBareLabel(label: string): string {
  const t = label.trim();
  const bracketed = t.match(/^\[([^\]]+)\]$/);
  return (bracketed ? bracketed[1] : t.replace(/^@/, '')).trim();
}

function mentionLabelVariants(label: string): string[] {
  const full = label.trim();
  if (!full) return [];
  const bare = mentionBareLabel(full);
  return [...new Set([full, bare, `@${bare}`, `[${bare}]`])];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionLabelsForElement(el: Element): string[] {
  const labels = new Set<string>();
  const dv = el.getAttribute('data-value')?.trim();
  if (dv) labels.add(dv);
  const valueEl = el.querySelector('.ql-mention-value');
  const fromValueEl = valueEl?.textContent?.trim();
  if (fromValueEl) labels.add(fromValueEl);
  const text = el.textContent?.trim();
  if (text) labels.add(text.replace(/^@/, '').trim());
  return [...labels].filter(Boolean);
}

/** Remove a second plain-text copy of the label immediately after a mention node. */
function stripLeadingGhostText(text: string, labels: string[]): string | null {
  if (!labels.length) return null;
  const variants = [...new Set(labels.flatMap(mentionLabelVariants))].sort((a, b) => b.length - a.length);
  for (const variant of variants) {
    if (!variant) continue;
    const exact = new RegExp(`^(\\s*)${escapeRegExp(variant)}\\s*$`);
    const prefix = new RegExp(`^(\\s*)${escapeRegExp(variant)}(?=\\s|$)`);
    if (exact.test(text)) return '';
    const m = text.match(prefix);
    if (m) {
      return text.slice((m[1]?.length ?? 0) + variant.length).replace(/^\s/, '');
    }
  }
  return null;
}

function removeGhostTextAfterMentions(root: ParentNode): void {
  const mentions = Array.from(root.querySelectorAll('span.mention[data-value], a[class*="mention"]'));
  for (const el of mentions) {
    const labels = mentionLabelsForElement(el);
    if (!labels.length) continue;
    let sibling = el.nextSibling;
    while (sibling) {
      if (sibling.nodeType !== Node.TEXT_NODE) break;
      const raw = sibling.textContent ?? '';
      const stripped = stripLeadingGhostText(raw, labels);
      if (stripped === null) break;
      if (stripped === '') {
        const remove = sibling;
        sibling = sibling.nextSibling;
        remove.remove();
        continue;
      }
      sibling.textContent = stripped;
      break;
    }
  }
}

function dedupeQuillMentionGhostTextDom(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="quill-dedupe">${html}</div>`, 'text/html');
  const root = doc.getElementById('quill-dedupe');
  if (!root) return html;
  removeGhostTextAfterMentions(root);
  return root.innerHTML;
}

function dedupeQuillMentionGhostTextRegex(html: string): string {
  return html.replace(
    /(<a\b[^>]*\bclass="[^"]*\bmention\b[^"]*"[^>]*>)([^<]+)(<\/a>)(\s*)([^<]+?)(?=<|$)/gi,
    (match, open: string, inner: string, close: string, _ws: string, ghost: string) => {
      const g = ghost.trim();
      if (!g) return match;
      const variants = new Set(mentionLabelVariants(inner));
      const dv = readMentionDataAttr(open, 'value');
      if (dv) mentionLabelVariants(dv).forEach((v) => variants.add(v));
      if ([...variants].some((v) => v === g || mentionBareLabel(v) === g)) {
        return `${open}${inner}${close}`;
      }
      return match;
    },
  );
}

/** quill-mention sometimes leaves a second plain-text copy of the label after the embed (saved HTML + display). */
export function dedupeQuillMentionGhostText(html: string): string {
  if (!html.includes('mention')) return html;
  if (typeof DOMParser !== 'undefined') {
    try {
      return dedupeQuillMentionGhostTextDom(html);
    } catch {
      /* regex fallback */
    }
  }
  return dedupeQuillMentionGhostTextRegex(html);
}

function mentionIdForType(rawId: string, mentionType: string): string {
  const typedPrefix = `${mentionType}:`;
  if (rawId.startsWith(typedPrefix)) return rawId.slice(typedPrefix.length);
  if (rawId.includes(':')) return rawId.slice(rawId.indexOf(':') + 1);
  return rawId;
}

function mentionAttrsFromElement(el: Element): string {
  return Array.from(el.attributes)
    .map((a) => `${a.name}="${a.value}"`)
    .join(' ');
}

function enhanceRecordMentionLinksDom(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="quill-enhance">${html}</div>`, 'text/html');
  const root = doc.getElementById('quill-enhance');
  if (!root) return html;

  for (const span of Array.from(root.querySelectorAll('span.mention'))) {
    const mentionType =
      span.getAttribute('data-mention-type') ??
      span.getAttribute('data-mentiontype');
    if (!mentionType) continue;
    const config = MENTION_TYPES[mentionType];
    if (!config) continue;

    const rawId = span.getAttribute('data-id') ?? '';
    const id = mentionIdForType(rawId, mentionType);
    if (!id) continue;

    const attrs = mentionAttrsFromElement(span);
    const label =
      span.getAttribute('data-value')?.trim() ||
      span.querySelector('.ql-mention-value')?.textContent?.trim() ||
      span.textContent?.replace(/^@/, '').trim() ||
      mentionType;

    const anchor = doc.createElement('a');
    anchor.className = config.className;
    anchor.setAttribute('href', config.path(id, attrs));
    anchor.textContent = label;
    span.replaceWith(anchor);
  }
  return root.innerHTML;
}

function enhanceRecordMentionLinksRegex(html: string): string {
  return html.replace(
    /<span\b([^>]*\bclass="[^"]*\bmention\b[^"]*"[^>]*)>((?:(?!<span\b)[\s\S])*?)<\/span>/gi,
    (match, attrs: string, inner: string) => {
      const mentionType =
        readMentionDataAttr(attrs, 'mention-type') ?? readMentionDataAttr(attrs, 'mentionType');
      if (!mentionType) return match;
      const config = MENTION_TYPES[mentionType];
      if (!config) return match;

      const rawId = readMentionDataAttr(attrs, 'id') ?? '';
      const id = mentionIdForType(rawId, mentionType);
      if (!id) return match;

      const label =
        readMentionDataAttr(attrs, 'value') ||
        inner.replace(/<[^>]+>/g, '').replace(/^@/, '').trim() ||
        mentionType ||
        'link';

      return `<a class="${config.className}" href="${config.path(id, attrs)}">${escapeHtml(label)}</a>`;
    },
  );
}

function enhanceRecordMentionLinks(html: string): string {
  if (!html.includes('mention')) return html;
  if (typeof DOMParser !== 'undefined') {
    try {
      return enhanceRecordMentionLinksDom(html);
    } catch {
      /* regex fallback */
    }
  }
  return enhanceRecordMentionLinksRegex(html);
}

/** Quill HTML for read-only display (upload URLs + navigable task/project @mentions). */
export function quillHtmlForDisplay(html: string | null | undefined): string {
  if (!html?.trim()) return '';
  const cleaned = dedupeQuillMentionGhostText(quillHtmlToBreakable(html));
  const linked = enhanceRecordMentionLinks(cleaned);
  return resolveQuillContentAssetUrls(dedupeQuillMentionGhostText(linked));
}
