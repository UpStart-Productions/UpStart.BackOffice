import Delta from 'quill-delta';
import { personCardValueFromDom, preparePersonCardNotesHtml } from './quill-person-card-render';

const MATCHER_SELECTOR = '.bo-person-card, .ql-person-card';
const patchedClipboards = new WeakSet<object>();

function personCardPasteMatcher(node: Node, delta: Delta): Delta {
  if (!(node instanceof HTMLElement)) return delta;
  const value = personCardValueFromDom(node);
  return new Delta().insert({ personCard: value });
}

/** Ensure saved/reloaded note HTML becomes one personCard embed, not embed + unpacked text. */
export function registerPersonCardClipboard(Quill: typeof import('quill').default): void {
  const Clipboard = Quill.import('modules/clipboard') as {
    DEFAULTS: { matchers: Array<[string | number, (node: Node, delta: Delta) => Delta]> };
    prototype: { convertHTML: (html: string) => Delta };
  };

  if (patchedClipboards.has(Clipboard)) return;
  patchedClipboards.add(Clipboard);

  const originalConvertHTML = Clipboard.prototype.convertHTML;
  Clipboard.prototype.convertHTML = function (html: string) {
    return originalConvertHTML.call(this, preparePersonCardNotesHtml(html));
  };

  const defaultsMatchers = Clipboard.DEFAULTS.matchers ?? [];
  const hasMatcher = defaultsMatchers.some((entry) => entry[0] === MATCHER_SELECTOR);
  if (!hasMatcher) {
    Clipboard.DEFAULTS.matchers = [...defaultsMatchers, [MATCHER_SELECTOR, personCardPasteMatcher]];
  }
}
