/**
 * Replaces non-breaking spaces in Quill HTML with regular spaces so text wraps correctly.
 * Quill 2.0.3+ converts spaces to &nbsp; in editor HTML export; ngx-quill uses that for form values.
 */
const NBSP_HTML_ENTITY =
  /(?:&nbsp;|&#0*160;|&#x0*A0;|&#x0*a0;)/gi;

export function quillHtmlToBreakable(html: string | null | undefined): string {
  if (html == null || typeof html !== 'string') return '';
  return html.replace(NBSP_HTML_ENTITY, ' ').replace(/\u00A0/g, ' ');
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
      normalized = quillHtmlToBreakable(currentValue);
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
