import type Quill from 'quill';
import type { QuillPersonCardValue } from './quill-person-card.types';

/** Insert at the current selection (mirrors QuillIconCoordinator). */
export function insertPersonCardInQuill(quill: Quill, value: QuillPersonCardValue): void {
  let range = quill.getSelection(true);
  if (range == null) {
    quill.focus();
    const index = Math.max(0, quill.getLength() - 1);
    quill.setSelection(index, 0, 'user');
    range = { index, length: 0 };
  }

  let index = range.index;
  if (range.length > 0) {
    quill.deleteText(range.index, range.length, 'user');
    index = range.index;
  }

  quill.insertEmbed(index, 'personCard', value, 'user');
  // Newline after the embed gives a real text line to type on (avoids cursor stuck on embed guards).
  quill.insertText(index + 1, '\n', 'user');
  quill.setSelection(index + 2, 0, 'user');
  quill.focus();
}
