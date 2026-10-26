import { environment } from '../../environments/environment';
import { preparePersonCardNotesHtml } from './quill-person-card-render';

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
      return quillHtmlToBreakable(originalGetHTML.apply(this, args));
    };
  }
  container.remove();

  const originalGetSemanticHTML = Quill.prototype.getSemanticHTML;
  Quill.prototype.getSemanticHTML = function (this: unknown, ...args: unknown[]) {
    return quillHtmlToBreakable(originalGetSemanticHTML.apply(this, args));
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
      return quillHtmlToBreakable(value);
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
        quillHtmlToBreakable(preparePersonCardNotesHtml(currentValue)),
      );
    }
    originalWriteValue.call(this, normalized);
    if (
      format === 'html' &&
      typeof normalized === 'string' &&
      normalized !== currentValue &&
      typeof this.onModelChange === 'function'
    ) {
      queueMicrotask(() => {
        if (typeof this.onModelChange !== 'function') return;
        if (this.quillEditor) {
          this.onModelChange(this.valueGetter()(this.quillEditor));
        } else {
          this.onModelChange(normalized);
        }
      });
    }
  };
}
