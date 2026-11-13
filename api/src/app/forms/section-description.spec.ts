import { describe, expect, it } from 'vitest';
import { parseFormDefinition, sectionDescriptionHtml } from '@upstart/back-office/shared';

describe('section descriptions', () => {
  it('keeps formatted text and drops unsafe tags', () => {
    expect(sectionDescriptionHtml('<p>Think about <strong>last week</strong>.</p><script>x()</script>')).toBe('<p>Think about <strong>last week</strong>.</p>');
  });
  it('turns older plain-text intros into paragraphs', () => {
    expect(sectionDescriptionHtml('First line\nsecond\n\nFish & chips')).toBe('<p>First line<br>second</p><p>Fish &amp; chips</p>');
  });
  it('treats an empty editor as no description', () => {
    expect(sectionDescriptionHtml('<p><br></p>')).toBeNull();
    expect(sectionDescriptionHtml('   ')).toBeNull();
    expect(sectionDescriptionHtml(null)).toBeNull();
  });
  it('keeps a form file section description as formatted text', () => {
    const def = parseFormDefinition({
      format: 'ubo-form',
      version: 1,
      name: 'F',
      sections: [{ name: 'S', description: '<p>Hello <em>there</em></p>', fields: [{ name: 'Q', type: 'TEXT' }] }],
    });
    expect(def.sections[0].description).toBe('<p>Hello <em>there</em></p>');
  });
});
