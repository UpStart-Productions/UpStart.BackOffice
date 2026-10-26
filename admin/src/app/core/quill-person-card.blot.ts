import {
  paintPersonCardNode,
  personCardExportOuterHtml,
  personCardValueFromDom,
} from './quill-person-card-render';
import type { QuillPersonCardValue } from './quill-person-card.types';

/** Inline embed (same model as lucideIcon) — block layout via CSS. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPersonCardBlot(Quill: typeof import('quill').default): any {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const Embed = Quill.import('blots/embed') as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  class PersonCardBlot extends Embed {
    static blotName = 'personCard';
    /** span = current; div + ql-person-card = legacy saved notes */
    static tagName = ['SPAN', 'DIV'];
    static className = 'bo-person-card';

    static create(value: QuillPersonCardValue | string) {
      const node = super.create(value) as HTMLElement;
      const parsed =
        typeof value === 'string'
          ? ({ contactId: '', name: value, firstName: '', lastName: null, role: null, email: '', phone: '', avatarUrl: null } satisfies QuillPersonCardValue)
          : value;
      paintPersonCardNode(node, parsed);
      return node;
    }

    static value(domNode: HTMLElement): QuillPersonCardValue {
      return personCardValueFromDom(domNode);
    }

    html(): string {
      return personCardExportOuterHtml(personCardValueFromDom(this['domNode']));
    }
  }

  return PersonCardBlot;
}
