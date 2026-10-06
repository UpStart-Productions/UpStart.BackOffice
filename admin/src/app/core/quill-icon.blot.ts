/**
 * Quill inline embed: a Lucide icon dropped into rich text (e.g. "Call us 📞" -> real Lucide icon).
 * Inline (not block) like Quill's own `formats/image`, since icons sit inside a line of text.
 * Registers on the shared Quill module (call from APP_INITIALIZER) — mirrors registerExternalCtaBlot
 * in quill-external-cta.blot.ts.
 *
 * Persists self-contained inline SVG in saved HTML (paths included) so mobile apps can render via
 * innerHTML without a Lucide library or sprite bundle.
 */
import {
  getLucideIconPathsInner,
  normalizeLucideIconName,
  parseLucideIconNameFromMarkup,
} from '@upstart/back-office/lucide-icons';

const INLINE_SVG_OPEN =
  '<svg class="lucide-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
const INLINE_SVG_CLOSE = '</svg>';

export function registerLucideIconBlot(Quill: typeof import('quill').default): void {
  Quill.register('formats/lucideIcon', createLucideIconBlot(Quill), true);
}

/** Back Office: returns the blot class (registered via ngx-quill `customModules`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLucideIconBlot(Quill: typeof import('quill').default): any {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const Embed = Quill.import('blots/embed') as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  class LucideIconBlot extends Embed {
    static blotName = 'lucideIcon';
    static tagName = 'span';
    static className = 'ql-lucide-icon';

    static create(value: { name: string } | string) {
      const node = super.create(value) as HTMLElement;
      const name =
        typeof value === 'string'
          ? normalizeLucideIconName(value)
          : normalizeLucideIconName(value?.name ?? '');
      node.setAttribute('data-icon', name);
      node.setAttribute('contenteditable', 'false');
      node.innerHTML = INLINE_SVG_OPEN + getLucideIconPathsInner(name) + INLINE_SVG_CLOSE;
      return node;
    }

    static value(domNode: HTMLElement): { name: string } {
      const fromAttr = domNode.getAttribute('data-icon');
      const fromMarkup = parseLucideIconNameFromMarkup(domNode.outerHTML);
      const name = fromAttr ?? fromMarkup ?? '';
      return { name: normalizeLucideIconName(name) };
    }
  }

  return LucideIconBlot;
}
